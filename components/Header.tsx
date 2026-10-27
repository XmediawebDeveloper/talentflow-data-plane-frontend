import { ArrowUpRight, Bell, Calendar, ChevronDown, ChevronRight, ClipboardList, Coins, Copy, Crown, FileSearch, FolderOpen, HelpCircle, LogOut, ShoppingCart, User, Users, Shield, Video, Zap, CreditCard, Book, FileText, CheckCircle, AlertCircle, Info, Activity, Command, Loader2, X, Building2, Menu, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { User as UserType } from '@/lib/types/tenant';
import NotificationCenter from './NotificationCenter';
import QuickActions from './QuickActions';
import GlobalSearch from './GlobalSearch';
// FIX-010: Import Tooltip for icon buttons
import { Tooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import brandLogo from '@/assets/brand/talent-flow-logo-header.webp';
import { useQuota } from '@/contexts/QuotaContext';
import notificationService, { Notification } from '@/lib/services/notificationService';
import { useRouter } from 'next/navigation';
import { useNotificationWebSocket } from '@/hooks/useNotificationWebSocket';
import { useAuth } from '@/lib/hooks/useAuth';
import { toast } from 'sonner';
import { PERMISSION_DENIED_MESSAGE } from '@/components/shared/PermissionLockedOverlay';
import { isRouteAuthorized } from '@/lib/navigation/routeAccess';
import NameAvatar from '@/components/ui/name-avatar';

/* Highest unread count the bell badge spells out. 1-9 show as themselves;
   anything from 10 up reads "9+" — the count keeps growing behind the scenes
   (the popup header and the Unread tab both show the real number), the badge
   just stops widening the header. */
const MAX_BADGE_COUNT = 9;

/* How many notifications the popup shows before it starts scrolling. The list
   is measured against the rows actually rendered rather than given a pixel
   height: a row is as tall as its message wraps, and that differs between the
   phone-width sheet and the desktop dropdown. */
const VISIBLE_NOTIFICATIONS = 2;

interface HeaderProps {
  onLogout: () => void;
  user: UserType | null;
  tenant?: any;
  onOpenTour?: () => void;
  onOpenShortcuts?: () => void;
  onOpenSettings?: () => void;
  onMenuClick?: () => void;
  isMobileMenuOpen?: boolean;
  subscriptionExpired?: boolean;
}

/* The "no user yet" check lives in this thin wrapper, NOT at the top of the
   body below. As `if (!user) return null;` ahead of ~40 hooks it made the
   hook count change the moment the user loaded (0 → 40), which React
   rejects with "Rendered more hooks than during the previous render"
   (minified error #310) — on every page, since the header is everywhere. */
export default function Header(props: HeaderProps) {
  if (!props.user) return null;
  return <HeaderBody {...props} user={props.user} />;
}

function HeaderBody({ onLogout, user, tenant, onOpenTour, onOpenShortcuts, onOpenSettings, onMenuClick, isMobileMenuOpen, subscriptionExpired }: HeaderProps & { user: UserType }) {
  const router = useRouter();
  const { refreshUser, isTenantAdmin, hasPermission } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [tenantStatus, setTenantStatus] = useState<string | null>(null);

  // Notification state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  /* Every notification the user has, read or not. Kept apart from
     `notifications.length`, which is only what the open tab last loaded — the
     All tab used to label itself with the Unread tab's row count the moment you
     switched over. */
  const [totalCount, setTotalCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [activeNotificationTab, setActiveNotificationTab] = useState<'all' | 'unread'>('all');
  /* Height of exactly VISIBLE_NOTIFICATIONS rows, measured off the rendered
     list (see the layout effect). Undefined until measured, and whenever the
     list is short enough not to need capping. */
  const [notificationListHeight, setNotificationListHeight] = useState<number | undefined>(undefined);
  const notificationListRef = useRef<HTMLDivElement | null>(null);

  // Use shared quota context instead of separate API call
  const { quotaData, loading: loadingQuota, error: quotaError, hasPermission: hasQuotaPermission, refetch: fetchQuotaStatus } = useQuota();

  // Listen for plan changes and unit consumption to refresh quota data
  useEffect(() => {
    const handlePlanChange = (event: Event) => {
      console.log('[Header] Plan changed, refreshing quota and notifications...');
      fetchQuotaStatus();
      // Refresh notification count after a delay to pick up backend-created notifications
      setTimeout(() => fetchNotificationCount(), 2000);

      // Show toast notification if plan change details are available
      // (dispatched by QuotaContext when it detects a plan change from the API)
      const detail = (event as CustomEvent)?.detail;
      if (detail?.previousPlan && detail?.newPlan) {
        const { previousPlan, newPlan, direction } = detail;
        if (direction === 'downgrade') {
          toast.warning('Plan Downgraded', {
            description: `Your plan has been changed from ${previousPlan} to ${newPlan}. Some features may no longer be available.`,
            duration: 8000,
          });
        } else if (direction === 'upgrade') {
          toast.success('Plan Upgraded', {
            description: `Your plan has been upgraded from ${previousPlan} to ${newPlan}.`,
            duration: 6000,
          });
        } else {
          toast.info('Plan Changed', {
            description: `Your plan has been changed from ${previousPlan} to ${newPlan}.`,
            duration: 6000,
          });
        }
      }
    };

    // Debounce rapid consecutive events (e.g. scoring 7 resumes fires 7 events).
    // Coalesce into a single quota refresh 1.5s after the last event.
    const debounceRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    const handleUnitsConsumed = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        console.log('[Header] Units consumed (debounced), refreshing quota...');
        fetchQuotaStatus();
      }, 1500);
    };

    window.addEventListener('planChanged', handlePlanChange);
    window.addEventListener('unitsConsumed', handleUnitsConsumed);
    return () => {
      window.removeEventListener('planChanged', handlePlanChange);
      window.removeEventListener('unitsConsumed', handleUnitsConsumed);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [user]);

  // Get JWT token for WebSocket.
  // IMPORTANT: wsToken must only change when the user's IDENTITY changes (login / logout).
  // If it changed on every user-object update (e.g. after refreshUser() or a permission
  // refresh), the WebSocket hook would see a new token prop, tear down the live connection,
  // and attempt to reconnect — which can exhaust the 5-attempt limit and leave the socket
  // permanently dead.
  const wsUserIdRef = useRef<string | null | undefined>(undefined); // undefined = uninitialized
  const [wsToken, setWsToken] = useState<string | null>(() => {
    // Initialise once from localStorage so the WS can connect immediately on mount.
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('accessToken');
    console.log('[Header] wsToken initialised from localStorage:', token ? `✅ present (${token.substring(0, 20)}...)` : '❌ null/missing');
    return token;
  });

  useEffect(() => {
    const currentUserId = user?.id ?? null;

    if (wsUserIdRef.current === undefined) {
      // First render — wsToken already initialised in useState above; just record the id.
      wsUserIdRef.current = currentUserId;
      return;
    }

    if (wsUserIdRef.current !== currentUserId) {
      // User identity actually changed (logged in / logged out / switched account).
      wsUserIdRef.current = currentUserId;
      const token = currentUserId ? localStorage.getItem('accessToken') : null;
      console.log('[Header] wsToken updated (identity change):', token ? `✅ present (${token.substring(0, 20)}...)` : '❌ null/missing');
      setWsToken(token);
    }
    // Same user → do NOT touch wsToken. A permission refresh (or any other user-object
    // update) must not disconnect a healthy WebSocket.
  }, [user]);

  /* Bumped by every fetchNotifications run, so a response for a tab the user
     has since left (or an older poll) can't overwrite the newer list. */
  const notificationsFetchSeqRef = useRef(0);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const seq = ++notificationsFetchSeqRef.current;
    const isStale = () => seq !== notificationsFetchSeqRef.current;
    setNotificationsLoading(true);
    try {
      const response = await notificationService.getNotifications(
        20, 0, activeNotificationTab === 'unread'
      );
      if (isStale()) return;
      setNotifications(response.notifications);
      setUnreadCount(response.unread_count);
      // Only the All tab's response counts everything; the Unread tab's total
      // is the unread subset, and taking it would shrink the All tab's label.
      if (activeNotificationTab === 'all') setTotalCount(response.total);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      if (!isStale()) setNotificationsLoading(false);
    }
  }, [user, activeNotificationTab]);

  // Fetch notification count only
  const fetchNotificationCount = useCallback(async () => {
    if (!user) return;

    try {
      const response = await notificationService.getNotificationCounts();
      setUnreadCount(response.unread);
      setTotalCount(response.total);
    } catch (error) {
      console.error('Error fetching notification count:', error);
    }
  }, [user]);

  // Use ref to track showNotifications for WebSocket callback without causing re-renders
  const showNotificationsRef = useRef(showNotifications);
  useEffect(() => {
    showNotificationsRef.current = showNotifications;
  }, [showNotifications]);

  // Track if initial notification count fetch has been done (to prevent duplicate fetches)
  const initialFetchDoneRef = useRef(false);

  // Track if welcome notification call has been made this session
  const welcomeNotifCalledRef = useRef(false);

  // Handle new notification from WebSocket - stable callback
  const handleNewNotification = useCallback((notification: any) => {
    console.log('[Header] New notification via WebSocket:', notification);
    // Increment unread count
    setUnreadCount(prev => prev + 1);
    // Dispatch event to trigger refresh if panel is open
    window.dispatchEvent(new CustomEvent('wsNotificationReceived'));
  }, []);

  // Handle count update from WebSocket - stable callback
  const handleCountUpdate = useCallback((count: number) => {
    console.log('[Header] Count update via WebSocket:', count);
    setUnreadCount(count);
  }, []);

  // Listen for WebSocket notification events to refresh list if panel is open
  useEffect(() => {
    const handleWsNotification = () => {
      if (showNotificationsRef.current) {
        fetchNotifications();
      }
    };
    window.addEventListener('wsNotificationReceived', handleWsNotification);
    return () => window.removeEventListener('wsNotificationReceived', handleWsNotification);
  }, [fetchNotifications]);

  // WebSocket connection for real-time notifications
  const { isConnected: wsConnected, connectionError: wsError } = useNotificationWebSocket({
    token: wsToken,
    onNewNotification: handleNewNotification,
    onCountUpdate: handleCountUpdate,
    onPermissionsUpdated: () => {
      console.log('[Header] onPermissionsUpdated triggered via WebSocket — calling refreshUser() + fetchQuotaStatus()');
      refreshUser();
      // Also refresh quota data to detect plan changes (e.g., admin-initiated downgrade)
      fetchQuotaStatus();
      // Refresh notification count after a delay to pick up backend-created notifications
      setTimeout(() => fetchNotificationCount(), 2000);
    },
    enabled: !!user && !!wsToken,
  });

  // Log WebSocket connection status changes. Routine connect/reconnect flips
  // are dev-only noise; a real error is worth seeing everywhere.
  useEffect(() => {
    if (wsError) {
      console.warn('[Header] WebSocket error:', wsError);
    } else if (process.env.NODE_ENV !== 'production') {
      console.log('[Header] WebSocket status — connected:', wsConnected);
    }
  }, [wsConnected, wsError]);

  // Fetch notifications on mount and when dropdown opens
  useEffect(() => {
    if (showNotifications) {
      fetchNotifications();
    }
  }, [showNotifications, fetchNotifications]);

  /* Cap the popup's list at VISIBLE_NOTIFICATIONS rows.
     Measured rather than hard-coded: rows are as tall as their message wraps,
     and a fixed pixel height would cut the second row in half on one screen and
     leave a gap on another. Runs before paint (useLayoutEffect) so the popup
     never flashes open at full height and then snaps shorter.
     Re-measured on resize because the popup is a full-width sheet under `sm`
     and a 24rem dropdown above it — the same two rows are not the same height
     in both. */
  useLayoutEffect(() => {
    if (!showNotifications) return;

    const measure = () => {
      /* The list is swapped for a spinner on every refresh — and while the
         popup is open that is every 10s. Holding the last height through it
         keeps the popup from collapsing to spinner-height and springing back. */
      if (notificationsLoading) return;

      const list = notificationListRef.current;
      const rows = list ? (Array.from(list.children) as HTMLElement[]) : [];
      // Nothing to scroll past — let the popup size to its content instead,
      // so one notification doesn't sit in a two-row well of white space.
      if (!list || rows.length <= VISIBLE_NOTIFICATIONS) {
        setNotificationListHeight(undefined);
        return;
      }
      /* Rows plus the list's own padding. Deliberately offset-based rather
         than getBoundingClientRect: a re-measure that lands while the user has
         the list scrolled would read rects that have already moved up, and the
         popup would shrink by however far they had scrolled. offsetTop is
         measured from a shared ancestor, so the difference holds either way. */
      const lastVisible = rows[VISIBLE_NOTIFICATIONS - 1];
      const style = getComputedStyle(list);
      const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      const height = lastVisible.offsetTop + lastVisible.offsetHeight - rows[0].offsetTop + padding;
      setNotificationListHeight(Math.round(height));
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [showNotifications, notifications, notificationsLoading, activeNotificationTab]);

  // Initial fetch: Only fetch once on mount when user is available
  useEffect(() => {
    if (user && !initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      fetchNotificationCount();
      console.log('[Header] Initial notification count fetch');
    }
  }, [user, fetchNotificationCount]);

  // Welcome notification: Trigger on first quota load for tenant_admin users
  useEffect(() => {
    if (
      !user ||
      !quotaData ||
      welcomeNotifCalledRef.current ||
      user.role !== 'tenant_admin' ||
      !['active', 'trial'].includes(quotaData.subscription_status || '')
    ) {
      return;
    }
    welcomeNotifCalledRef.current = true;
    notificationService.ensureWelcomeNotification({
      plan_name: quotaData.plan_name || quotaData.plan_info?.plan_name,
      is_trial: !!quotaData.is_trial,
      days_remaining: quotaData.trial_info?.days_remaining,
      plan_tier: quotaData.plan_info?.plan_tier,
      billing_period: quotaData.plan_info?.billing_period,
    }).then((result) => {
      if (result.status === 'created') {
        // Refresh notification count to show the new welcome notification
        fetchNotificationCount();
      }
    });
  }, [user, quotaData, fetchNotificationCount]);

  // Status notifications: Check expiry, quota exhausted, quota low on first quota load per session
  const statusCheckCalledRef = useRef(false);

  useEffect(() => {
    if (!user || !quotaData || statusCheckCalledRef.current) return;
    if (!['active', 'trial', 'expired'].includes(quotaData.subscription_status || '')) return;

    statusCheckCalledRef.current = true;

    // Build quota payload from quotaData
    // safeInt: coerce any value to a finite integer safe for Pydantic's `int` field.
    // Handles NaN/Infinity (JSON.stringify gives null for these, causing 422), floats, and strings.
    const safeInt = (v: unknown): number => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : 0;
    };
    const quotaPayload: Record<string, { total_remaining: number; total_limit: number; is_unlimited: boolean }> = {};
    if (quotaData.quotas) {
      for (const [key, quota] of Object.entries(quotaData.quotas)) {
        if (quota) {
          const isUnlimited = !!(quota as any).is_unlimited;
          const totalRemaining = safeInt(quota.total_remaining);
          const subLimit = safeInt(quota.subscription?.limit);
          const addonPurchased = safeInt(quota.addon?.total_purchased);
          quotaPayload[key] = {
            total_remaining: safeInt(quota.total_remaining),
            total_limit: safeInt(quota.subscription?.limit) + safeInt(quota.addon?.total_purchased),
            is_unlimited: isUnlimited,
          };
        }
      }
    }

    notificationService.checkStatusNotifications({
      plan_name: quotaData.plan_name || quotaData.plan_info?.plan_name,
      is_trial: !!quotaData.is_trial,
      subscription_status: quotaData.subscription_status,
      plan_expiry_date: quotaData.plan_expiry_date,
      trial_end_date: quotaData.trial_end_date || quotaData.trial_info?.trial_end_date,
      quotas: quotaPayload,
    }).then((result) => {
      if (result.count > 0) {
        fetchNotificationCount();
      }
    });
  }, [user, quotaData, fetchNotificationCount]);

  // Fallback polling: Only when WebSocket is not connected
  useEffect(() => {
    // Skip if no user or WebSocket is connected
    if (!user || wsConnected) {
      if (wsConnected) {
        console.log('[Header] WebSocket connected - polling disabled');
      }
      return;
    }

    console.log('[Header] WebSocket not connected - using fallback polling');
    // Fallback polling: 60 seconds when panel is closed, 10 seconds when open
    const pollInterval = showNotifications ? 10000 : 60000;
    const interval = setInterval(() => {
      if (showNotifications) {
        fetchNotifications();
      } else {
        fetchNotificationCount();
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [user, wsConnected, showNotifications, fetchNotifications, fetchNotificationCount]);

  // Instant refresh: Listen for notification trigger events (for local actions)
  useEffect(() => {
    const handleNotificationTrigger = () => {
      console.log('[Header] Notification trigger received, refreshing...');
      fetchNotificationCount();
      if (showNotifications) {
        fetchNotifications();
      }
    };

    window.addEventListener('notificationTrigger', handleNotificationTrigger);
    return () => window.removeEventListener('notificationTrigger', handleNotificationTrigger);
  }, [fetchNotificationCount, fetchNotifications, showNotifications]);

  // Handle mark notification as read
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead([notificationId]);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Handle mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await handleMarkAsRead(notification.id);
    }
    if (user.role === 'tenant_admin' && notification.action_url) {
      setShowNotifications(false);
      router.push(notification.action_url);
    }
  };

  // Get icon and colors for notification type
  const getNotificationStyle = (type: string) => {
    switch (type) {
      case 'success':
        return {
          icon: CheckCircle,
          bgColor: 'bg-success-subtle',
          iconColor: 'text-success-strong',
          borderColor: 'border-success',
          labelColor: 'text-success-strong',
          bgTint: 'bg-success-subtle/30',
        };
      case 'warning':
        return {
          icon: AlertCircle,
          bgColor: 'bg-warning-subtle',
          iconColor: 'text-warning-strong',
          borderColor: 'border-warning',
          labelColor: 'text-warning-strong',
          bgTint: 'bg-warning-subtle/30',
        };
      case 'error':
        return {
          icon: AlertCircle,
          bgColor: 'bg-destructive-subtle',
          iconColor: 'text-destructive-strong',
          borderColor: 'border-destructive',
          labelColor: 'text-destructive-strong',
          bgTint: 'bg-destructive-subtle/30',
        };
      default:
        return {
          icon: Info,
          bgColor: 'bg-gray-100',
          iconColor: 'text-gray-600',
          borderColor: 'border-gray-500',
          labelColor: 'text-gray-700',
          bgTint: 'bg-gray-50/30',
        };
    }
  };
  
  // Calculate total units across all quota types (RU + RS + AS + AIU) — max_seats excluded
  const calculateTotalUnits = () => {
    if (!quotaData?.quotas) return { remaining: 0, limit: 0, used: 0 };

    const quotas = quotaData.quotas;
    // Exclude max_seats from totals — it is shown separately in the dropdown
    const unitTypes = ['RU', 'RS', 'AS', 'AIU'];

    let totalRemaining = 0;
    let totalLimit = 0;
    let totalUsed = 0;

    unitTypes.forEach(quotaType => {
      if (quotas[quotaType]) {
        const quota = quotas[quotaType];
        // Skip unlimited quotas in the calculation
        if ((quota as any).is_unlimited) return;

        totalRemaining += (quota.total_remaining as number) || 0;
        totalLimit += (quota.subscription?.limit as number || 0) + (quota.addon?.total_purchased || 0);
        // Same "used" as each row of the breakdown below: plan plus add-on
        // consumption, matching a limit that includes add-on units. Raw
        // counters rather than `limit - remaining` — see the rows' note.
        totalUsed += ((quota.subscription?.used as number) ?? 0) + ((quota.addon?.total_consumed as number) ?? 0);
      }
    });

    return { remaining: totalRemaining, limit: totalLimit, used: totalUsed };
  };

  // Label, module icon and brand tint for each quota key shown in the plan
  // dropdown. Icons match the sidebar's modules (FolderOpen = My Resumes,
  // FileSearch = Resume Scoring, ClipboardList = Assessments, Video = AI
  // Interviews); tints come from the brand palette so each row keeps its own
  // identity without leaving the design system.
  const quotaMeta: Record<string, { label: string; icon: LucideIcon; tile: string; bar: string; left: string }> = {
    RU: { label: 'Resume Storage', icon: FolderOpen, tile: 'bg-brand-blue/10 text-brand-blue', bar: 'bg-brand-blue', left: 'text-brand-blue' },
    RS: { label: 'Resume Scoring', icon: FileSearch, tile: 'bg-brand-teal/10 text-brand-teal', bar: 'bg-brand-teal', left: 'text-brand-teal' },
    AS: { label: 'Assessments', icon: ClipboardList, tile: 'bg-brand-orange/10 text-brand-orange-deep', bar: 'bg-brand-orange', left: 'text-brand-orange-deep' },
    AIU: { label: 'AI Interviews', icon: Video, tile: 'bg-brand-cyan/10 text-brand-cyan', bar: 'bg-brand-cyan', left: 'text-brand-cyan' },
  };

  const totalUnits = calculateTotalUnits();

  // Determine plan name based on status
  const getPlanDisplayName = () => {
    if (loadingQuota) return 'Loading...';
    if (tenantStatus === 'PENDING') return 'Account Pending';
    if (tenantStatus === 'SUSPENDED') return 'Account Suspended';
    if (tenantStatus === 'LOCKED') return 'Account Locked';
    if (quotaError) return 'Unable to load';
    const rawName = quotaData?.plan_name || quotaData?.plan_info?.plan_name;
    if (!rawName || rawName.toLowerCase() === 'no plan') {
      return quotaData?.is_trial ? 'Free Trial' : 'No plan data';
    }
    return rawName.replace(/\s*\(.*?\)\s*/g, '').trim() || rawName;
  };

  const planName = getPlanDisplayName();
  const usagePercentage = totalUnits.limit > 0 ? ((totalUnits.used / totalUnits.limit) * 100) : 0;
  const isPendingStatus = tenantStatus === 'PENDING' || tenantStatus === 'SUSPENDED' || tenantStatus === 'LOCKED';
  const isExpiredSubscription = ['expired', 'inactive'].includes((quotaData?.subscription_status || '').toLowerCase());

  // Plan meta line for the dropdown header: billing cadence, renewal date and
  // days left. Every piece is optional — a segment that has no data simply
  // doesn't render rather than showing a placeholder.
  const rawBillingPeriod = quotaData?.plan_info?.billing_period;
  const planPeriodLabel = quotaData?.is_trial
    ? 'Trial plan'
    : rawBillingPeriod
    ? `${rawBillingPeriod.charAt(0).toUpperCase()}${rawBillingPeriod.slice(1).toLowerCase()} plan`
    : null;
  const renewalSource = quotaData?.plan_expiry_date
    || quotaData?.billing_period?.end
    || quotaData?.trial_end_date
    || quotaData?.trial_info?.trial_end_date;
  const renewalDate = renewalSource ? new Date(renewalSource) : null;
  const renewalValid = !!(renewalDate && !isNaN(renewalDate.getTime()));
  const renewalLabel = renewalValid
    ? renewalDate!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const planDaysLeft = renewalValid
    ? Math.max(0, Math.ceil((renewalDate!.getTime() - Date.now()) / 86400000))
    : quotaData?.is_trial
    ? quotaData?.trial_info?.days_remaining ?? null
    : null;

  const roleLabels: Record<string, string> = {
    tenant_admin: 'Owner',
    admin: 'Admin',
    recruiter: 'Recruiter',
    viewer: 'Viewer',
    billing_manager: 'Billing Manager',
    standard_user: 'Member',
  };

  const prettyRole = (r?: string) =>
    (r && roleLabels[r]) ||
    (r ? r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');

  /* The badge shows the human-readable code ("US-008") and nothing else.
     Deliberately no uuid fallback: a raw uuid is not an id anyone can read out,
     and showing one would only look like the feature is broken. AuthProvider
     backfills the code when `/auth/me` omits it, so the badge is absent only
     for an account that genuinely has none — where an empty pill is the honest
     answer. */
  const userIdBadge = user.userDisplayId;

  const copyUserId = async () => {
    if (!userIdBadge) return;
    try {
      await navigator.clipboard.writeText(userIdBadge);
      /* Confirmed with a toast rather than a tick held in component state.
         This component early-returns on `!user` BEFORE its hooks, so every
         `useState` in it is already a rules-of-hooks violation — adding one
         more for a 1.6s checkmark is not worth it, and a toast is how the rest
         of this file reports what happened anyway. */
      toast.success('User ID copied to clipboard');
    } catch {
      /* Clipboard is blocked on insecure origins and by some browser policies.
         Say so rather than flashing a tick for a copy that did not happen —
         the tooltip still shows the full id to select by hand. */
      toast.error('Could not copy — your browser blocked clipboard access');
    }
  };

  /* ---- The profile dropdown's rows -------------------------------------------
     Held as data rather than seven near-identical <button> blocks. They had
     already drifted as copies do — every row carried the subscription gate
     except User Guide and Support Tickets, which are deliberately ungated, and
     the difference was expressed by writing a whole second variant of the
     className instead of by a flag. One shape, one place to change it.

     `show` is the role/audience gate (hides the row). `permitted: false` is
     the RBAC gate: the row stays visible but greyed, with a hover tooltip and
     a no-op click — permission-gated rows are never hidden. `alwaysEnabled` is the separate
     question of whether a lapsed subscription locks the row: docs and support
     stay reachable precisely because the plan lapsed. */
  const profileMenuItems: {
    id: string;
    icon: LucideIcon;
    title: string;
    subtitle: string;
    href: string;
    show?: boolean;
    permitted?: boolean;
    deniedMessage?: string;
    alwaysEnabled?: boolean;
  }[] = [
    {
      id: 'profile',
      icon: User,
      title: 'Profile Settings',
      subtitle: 'Update your personal information',
      href: '/settings/general-settings',
    },
    {
      id: 'plan',
      icon: CreditCard,
      title: 'Upgrade Plans',
      subtitle: 'Billing & subscription',
      href: '/subscription/current-plan',
      deniedMessage: 'You do not have permission to view the subscription plan',
    },
    {
      id: 'company',
      icon: Building2,
      title: 'Company Profile',
      subtitle: 'Organization details',
      href: '/organization/company-profile',
      deniedMessage: 'You do not have permission to manage the company profile',
    },
    {
      id: 'audit-log',
      icon: Activity,
      title: 'Audit Log',
      subtitle: 'View your recent activity',
      href: '/audits/activity',
      deniedMessage: 'You do not have permission to view the audit log',
    },
    {
      id: 'audit-trail',
      icon: FileText,
      title: 'Audit Trail',
      subtitle: 'Detailed system audit logs',
      href: '/audits/trail',
      show: !!user.is_tenant_admin,
    },
    /* User Guide — the header's own guide button is hidden below sm, so this is
       the only way to it on a phone. It goes straight to /help rather than
       opening that dropdown, which would render nothing at mobile widths. */
    {
      id: 'guide',
      icon: Book,
      title: 'User Guide',
      subtitle: 'Guides, articles and how-tos',
      href: '/help',
      alwaysEnabled: true,
    },
    {
      id: 'support',
      icon: HelpCircle,
      title: 'Support Tickets',
      subtitle: 'Help & support requests',
      href: '/support-tickets',
      alwaysEnabled: true,
      deniedMessage: 'You do not have permission to view support tickets',
    },
  ];
  // Every row is greyed by the SAME rule the page guard (RouteGuard) uses, so a
  // row is never clickable when its page would refuse the user, and never greyed
  // when the page would open. An explicit `permitted` still wins.
  profileMenuItems.forEach((item) => {
    if (item.permitted === undefined) {
      item.permitted = isRouteAuthorized(item.href, { isTenantAdmin, hasPermission });
    }
  });

  return (
    <header className="h-14 sm:h-16 lg:h-[72px] bg-white border-b border-gray-200">
      {/* px-4 / md:px-8: the same 16px / 32px gutter as every page panel, so
          the header's edges line up with the content under it. */}
      <div className="mx-auto flex h-full w-full max-w-[1400px] items-center justify-between px-4 md:px-8">
      {/* Hamburger Menu Button - Only on Mobile */}
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors mr-2"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {isMobileMenuOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </button>
      )}

      {/* Brand logo — shown in the header so the dashboard route (where the sidebar is hidden) still has a brand mark. */}
      <Link href="/dashboard" aria-label="TalentFlow home" className="flex items-center mr-2 sm:mr-4 lg:mr-6 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brandLogo.src}
          alt="TalentFlow"
          width={brandLogo.width}
          height={brandLogo.height}
          // h-6 below 360px: at 320 the icon cluster on the right was
          // clipped by a few px.
          className="h-6 min-[360px]:h-7 sm:h-10 lg:h-12 w-auto"
        />
      </Link>

      {/* Global Search Bar - Hidden on mobile, visible on desktop */}
      <GlobalSearch className="hidden lg:flex items-center flex-1 max-w-sm" />

      {/* Spacer for mobile to push icons to the right */}
      <div className="flex-1 lg:hidden" />

      <div className="flex items-center gap-1 sm:gap-2 lg:gap-3 lg:ml-8">
        {/* FIX-010: Keyboard Shortcuts Button with Tooltip - Hidden on mobile */}
        {onOpenShortcuts && (
          <Tooltip content="Keyboard Shortcuts (Cmd/Ctrl + /)" position="bottom">
            <button
              onClick={onOpenShortcuts}
              className="hidden sm:block p-2 text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors border border-gray-200 hover:border-brand-blue/30"
              aria-label="Keyboard Shortcuts"
            >
              <Command className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </Tooltip>
        )}

        {/* Quick Tour Button - Hidden on mobile and tablet */}
        {onOpenTour && (
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenTour}
            icon={<Zap className="w-4 h-4" />}
            className="hidden lg:inline-flex"
            aria-label="Take a quick tour" title="Take a quick tour"
          >
            Quick Tour
          </Button>
        )}

        {/* Plan & Unit Balance Display - Clickable to show breakdown dropdown */}
        {hasQuotaPermission && (
          <div className="relative">
            <button
              onClick={() => {
                setShowPlanMenu(!showPlanMenu);
                setShowNotifications(false);
                setShowUserMenu(false);
              }}
              className="liquid-glass-card group flex min-h-[36px] sm:min-h-[44px] items-center gap-1.5 lg:gap-2 rounded-lg px-1.5 py-1 sm:px-2 sm:py-1.5 lg:px-2.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/25"
            >
              <div className="w-6 h-6 rounded-lg border border-brand-blue/10 bg-brand-blue/[0.07] shadow-sm shadow-brand-blue/5 flex items-center justify-center">
                <CreditCard className="w-3.5 h-3.5 text-brand-blue" strokeWidth={2.15} />
              </div>
              {/* Name + units hide on the smallest screens — the pill collapses
                  to icon + chevron so the header row still fits. */}
              <div className="hidden sm:flex flex-col min-w-0 text-left">
                <span className="text-2xs lg:text-xs font-semibold text-slate-950 dark:text-slate-50 truncate max-w-[90px] md:max-w-[130px] lg:max-w-[170px] leading-tight" title={loadingQuota ? 'Loading...' : planName}>
                  {loadingQuota ? 'Loading...' : planName}
                </span>
                {!loadingQuota && !quotaError && !isPendingStatus && !isExpiredSubscription && (
                  <div className="flex items-center gap-1 leading-tight">
                    <span className="text-2xs lg:text-xs font-bold text-brand-blue tabular-nums">{totalUnits.remaining.toLocaleString()}</span>
                    <span className="text-2xs lg:text-2xs text-gray-500 dark:text-slate-400">units left</span>
                  </div>
                )}
                {isPendingStatus && (
                  <span className="text-2xs lg:text-2xs text-warning-strong font-medium">
                    {tenantStatus}
                  </span>
                )}
              </div>
              {!loadingQuota && !quotaError && !isPendingStatus && !isExpiredSubscription && totalUnits.limit > 0 && (
                <div className="hidden sm:block w-10 lg:w-12 h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usagePercentage > 90 ? 'bg-destructive' :
                      usagePercentage > 70 ? 'bg-brand-orange' : 'bg-brand-blue'
                    }`}
                    style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                  />
                </div>
              )}
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform group-hover:text-slate-500 dark:text-slate-500 ${showPlanMenu ? 'rotate-180' : ''}`} />
            </button>

            {showPlanMenu && !isExpiredSubscription && (
              <>
                {/* Header dropdowns all sit in one band: z-[60] backdrop,
                    z-[70] panel. <header> itself is static with no z-index, so
                    these compete directly with page chrome rather than being
                    scoped inside a header stacking context — at the old z-10 /
                    z-20 the sticky breadcrumb (z-30) and content cards painted
                    straight over them. The band clears every in-page layer
                    (page dropdowns peak at z-50) and stays under the layout's
                    global modals, which start at z-[88]. */}
                <div className="fixed inset-0 z-[80]" onClick={() => setShowPlanMenu(false)} />
                {/* Phones AND small tablets get a fixed, full-width sheet under
                    the header: the pill sits ~180px in from the right edge, so
                    a 520px panel anchored to it would run off the left of any
                    viewport narrower than ~768px. Only md+ anchors to the pill. */}
                <div className="fixed left-3 right-3 top-[4.25rem] md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-[420px] md:max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto bg-white rounded-xl shadow-xl border border-gray-200 z-[85]">
                  {/* Plan header — name, cadence/renewal meta, Upgrade plan.
                      flex-wrap lets the button drop below the meta line on
                      narrow phones instead of crushing the plan name. */}
                  {/* No flex-wrap here: the meta line wraps INSIDE the left
                      block, so the Upgrade button stays pinned to the right
                      corner instead of dropping below the plan name. */}
                  <div className="px-2.5 py-2 sm:px-3 sm:py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 border-b border-gray-100">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand-blue text-white ring-1 ring-white/10 shadow-sm shadow-brand-blue/25 flex items-center justify-center flex-shrink-0">
                        <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{planName}</h3>
                        <div className="flex items-center gap-1 flex-wrap text-2xs text-gray-500 mt-0.5">
                          {planPeriodLabel && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              {planPeriodLabel}
                            </span>
                          )}
                          {renewalLabel && (
                            <>
                              {planPeriodLabel && <span className="text-gray-300">•</span>}
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-gray-400" />
                                {quotaData?.is_trial ? 'Ends on' : 'Renews on'} {renewalLabel}
                              </span>
                            </>
                          )}
                          {planDaysLeft != null && (
                            <>
                              {(planPeriodLabel || renewalLabel) && <span className="text-gray-300">•</span>}
                              <span className="text-success-strong font-medium">{planDaysLeft} days left</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setShowPlanMenu(false);
                        router.push('/subscription/current-plan');
                      }}
                      className="w-full sm:w-auto flex-shrink-0"
                    >
                      Upgrade plan
                      <ArrowUpRight className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Unit balance breakdown */}
                  <div className="px-3 pt-2 text-2xs font-semibold tracking-wider text-gray-500 uppercase">
                    Unit Balance Breakdown
                  </div>
                  <div className="px-3 divide-y divide-gray-100">
                    {quotaData?.quotas && (['RU', 'RS', 'AS', 'AIU'] as const).map(key => {
                      const quota = quotaData.quotas![key];
                      if (!quota) return null;
                      const meta = quotaMeta[key];
                      const RowIcon = meta.icon;
                      const isUnlimited = !!(quota as any).is_unlimited;
                      const remaining = isUnlimited ? null : ((quota.total_remaining as number) || 0);
                      const limit = isUnlimited ? null : ((quota.subscription?.limit as number || 0) + (quota.addon?.total_purchased || 0));
                      // Raw counters, not `limit - remaining` — `remaining` is floored at 0
                      // by the API, so that derivation silently caps "used" at `limit` and
                      // hides real consumption once a tenant goes over quota.
                      const used = isUnlimited ? 0 : ((quota.subscription?.used as number ?? 0) + (quota.addon?.total_consumed as number ?? 0));
                      const pct = limit && limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
                      return (
                        <div key={key} className="py-2 sm:py-2.5 flex items-center gap-2">
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.tile}`}>
                            <RowIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">{meta.label}</div>
                            {!isUnlimited && limit != null && limit > 0 && (
                              <div className="mt-1 h-1.5 max-w-[140px] bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-[width] ${meta.bar}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                          {isUnlimited ? (
                            <span className="text-xs font-semibold text-success-strong">Unlimited</span>
                          ) : (
                            <>
                              <span className="text-xs text-gray-600 tabular-nums whitespace-nowrap min-w-[50px] sm:min-w-[56px] text-right">
                                {used.toLocaleString()} used
                              </span>
                              <span className="w-px h-4 bg-gray-200 flex-shrink-0" />
                              <span className={`text-xs font-bold tabular-nums whitespace-nowrap min-w-[56px] sm:min-w-[64px] text-right ${meta.left}`}>
                                Left {(remaining ?? 0).toLocaleString()}
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Users limit — seats are not units, so they sit in their own
                      card below the breakdown rather than among the unit rows. */}
                  {quotaData?.quotas?.max_seats && (() => {
                    const seats = quotaData.quotas!.max_seats!;
                    const isUnlimited = !!(seats as any).is_unlimited;
                    const remaining = isUnlimited ? null : ((seats.total_remaining as number) || 0);
                    const limit = isUnlimited ? null : ((seats.subscription?.limit as number || 0) + (seats.addon?.total_purchased || 0));
                    const used = (limit != null && remaining != null) ? limit - remaining : 0;
                    return (
                      <div className="mx-3 mt-1.5 rounded-lg bg-brand-blue/5 border border-brand-blue/10 px-2.5 py-2 sm:px-3 sm:py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-200/70 text-gray-600 flex items-center justify-center flex-shrink-0">
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900">Users</div>
                          </div>
                          {isUnlimited ? (
                            <span className="text-xs font-semibold text-success-strong">Unlimited</span>
                          ) : (
                            <>
                              <span className="text-xs text-gray-600 tabular-nums whitespace-nowrap min-w-[50px] sm:min-w-[56px] text-right">
                                {used.toLocaleString()} used
                              </span>
                              <span className="w-px h-4 bg-gray-300 flex-shrink-0" />
                              <span className="text-xs font-bold text-gray-900 tabular-nums whitespace-nowrap min-w-[56px] sm:min-w-[64px] text-right">
                                Left {(remaining ?? 0).toLocaleString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Add-ons banner — deep-links to Usage & Quotas, where the
                      add-on purchase flow lives. */}
                  <div className="mx-3 my-2.5 rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-2 sm:px-3 sm:py-2.5 flex flex-wrap items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center flex-shrink-0">
                      <Info className="w-3.5 h-3.5" />
                    </div>
                    <span className="flex-1 min-w-0 text-sm font-medium text-gray-900">Need extra units right away?</span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setShowPlanMenu(false);
                        router.push('/subscription/current-plan?section=usage-quotas');
                      }}
                      className="w-full sm:w-auto flex-shrink-0"
                    >
                      Purchase Add-ons
                      <ShoppingCart className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* FIX-010: Notifications with Tooltip */}
        <div className="relative">
          <Tooltip content="Notifications" position="bottom">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowPlanMenu(false);
                setShowUserMenu(false);
              }}
              className="relative p-1.5 sm:p-2 text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {unreadCount > 0 && (
                /* Pinned to the button's very corner and kept small, so the
                   bell reads as a bell: at the previous size (h-4/h-5 plus a
                   2px white ring, inset from the corner) the badge sat over the
                   top-right quarter of the glyph. min-w + px rather than a
                   fixed width, because "9+" is twice as wide as "3" and a fixed
                   circle clipped it. */
                <span className="absolute top-0 right-0 flex items-center justify-center">
                  {/* The pulse. A halo expanding out from under the badge, not
                      the badge itself blinking — the number stays still and
                      legible, and nothing shifts the header's layout. Dropped
                      entirely for anyone who asked for less motion. */}
                  <span
                    className="absolute inset-0 rounded-full bg-destructive/60 animate-ping motion-reduce:hidden"
                    aria-hidden="true"
                  />
                  <span
                    className="relative flex items-center justify-center min-w-[0.875rem] sm:min-w-[1rem] h-3.5 sm:h-4 px-0.5 sm:px-1 bg-destructive text-white rounded-full ring-1 ring-white font-semibold text-2xs sm:text-2xs leading-none tabular-nums"
                    aria-hidden="true"
                  >
                    {unreadCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : unreadCount}
                  </span>
                </span>
              )}
            </button>
          </Tooltip>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-[80]"
                onClick={() => setShowNotifications(false)}
              ></div>
              <div className="fixed inset-x-3 top-[60px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-[85]">
                <div className="px-4 py-3 bg-brand-blue text-white">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium flex items-center gap-2">
                      {/* Real-time connection indicator */}
                      <Tooltip content={wsConnected ? 'Real-time connected' : 'Using polling'} position="bottom">
                        <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-success' : 'bg-warning'}`}></span>
                      </Tooltip>
                      <Bell className="w-5 h-5" />
                      Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">{unreadCount} new</span>
                    )}
                  </div>
                  <p className="text-sm text-white/80 mt-1">Stay updated with latest activities</p>
                </div>

                {/* Filter Tabs */}
                <div className="flex border-b border-gray-200 bg-gray-50">
                  <button
                    onClick={() => setActiveNotificationTab('all')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                      activeNotificationTab === 'all'
                        ? 'text-brand-blue border-b-2 border-brand-blue bg-white'
                        : 'text-gray-600 hover:text-brand-blue'
                    }`}
                  >
                    All ({totalCount})
                  </button>
                  <button
                    onClick={() => setActiveNotificationTab('unread')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                      activeNotificationTab === 'unread'
                        ? 'text-brand-blue border-b-2 border-brand-blue bg-white'
                        : 'text-gray-600 hover:text-brand-blue'
                    }`}
                  >
                    Unread ({unreadCount})
                  </button>
                </div>

                {/* Fixed to VISIBLE_NOTIFICATIONS rows once there are more than
                    that (see the layout effect) — the popup keeps its height and
                    the list scrolls inside it. `overscroll-contain` stops a
                    flick past the end from scrolling the page behind the popup;
                    the thin rounded scrollbar is the app-wide one from
                    globals.css. */}
                <div
                  className="overflow-y-auto scroll-smooth overscroll-contain max-h-[60dvh] sm:max-h-96"
                  style={notificationListHeight ? { height: notificationListHeight } : undefined}
                >
                  {notificationsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                      <Bell className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm">
                        {activeNotificationTab === 'unread' ? 'No unread notifications' : 'No notifications'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">You're all caught up!</p>
                    </div>
                  ) : (
                    <div ref={notificationListRef} className="p-2 space-y-1">
                      {notifications.map((notification) => {
                        const style = getNotificationStyle(notification.type);
                        const IconComponent = style.icon;
                        return (
                          <button
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`w-full text-left p-3 hover:bg-brand-blue/5 rounded-lg transition-colors ${
                              !notification.is_read ? `border-l-4 ${style.borderColor} ${style.bgTint}` : ''
                            }`}
                          >
                            <div className="flex gap-3">
                              <div className={`w-10 h-10 ${style.bgColor} rounded-full flex items-center justify-center flex-shrink-0`}>
                                <IconComponent className={`w-5 h-5 ${style.iconColor}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className={`text-sm ${notification.is_read ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
                                    {notification.title}
                                  </p>
                                  <span className="text-xs text-gray-500 whitespace-nowrap">{notification.time_ago}</span>
                                </div>
                                <p className="text-xs text-gray-600">{notification.message}</p>
                                {user.role === 'tenant_admin' && notification.action_label && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className={`text-xs ${style.labelColor} font-medium`}>{notification.action_label}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="border-t border-gray-200 p-3 bg-gray-50 flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleMarkAllAsRead}
                    disabled={unreadCount === 0}
                    className="flex-1"
                  >
                    Mark All Read
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setShowNotifications(false);
                      router.push('/notifications');
                    }}
                    className="flex-1"
                  >
                    View All
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Dark mode toggle */}
        <Tooltip content={resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'} position="bottom">
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 sm:p-2 text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
            aria-label="Toggle dark mode"
          >
            {resolvedTheme === 'dark'
              ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
              : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
            }
          </button>
        </Tooltip>

        <div className="hidden sm:block h-6 sm:h-8 w-px bg-gray-200 mx-1 sm:mx-2" />

        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowPlanMenu(false);
            }}
            className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 hover:bg-brand-blue/5 rounded-lg px-1.5 sm:px-3 py-1 sm:py-2 transition-colors"
          >
            <NameAvatar name={user.name} fallback={user.email} src={user.avatarUrl} size="md" />
            <div className="hidden md:block text-left">
              <div className="text-xs lg:text-sm text-gray-900 truncate max-w-[80px] lg:max-w-none">{user.name || user.email || 'User'}</div>
              <div className="text-2xs lg:text-xs text-gray-500">{user.roleDisplay || prettyRole(user.role)}</div>
            </div>
            <ChevronDown className="hidden md:block w-3 h-3 lg:w-4 lg:h-4 text-gray-400" />
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-[80]"
                onClick={() => setShowUserMenu(false)}
              ></div>
              {/* The panel bounds, the menu list scrolls — one bar, not two.
                  This carried `overflow-hidden` AND `overflow-y-auto`, so it
                  scrolled alongside the max-h menu list inside it and the
                  dropdown showed two vertical bars side by side. The `shrink-0`
                  markers on the header, org and sign-out rows are what hold
                  their size so the menu list is the part that gives way on a
                  short viewport, keeping Sign Out reachable instead of clipped
                  by the overflow-hidden. */}
              <div className="fixed inset-x-3 top-[60px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-200 ring-1 ring-black/[0.02] overflow-hidden z-[85] max-h-[calc(100dvh-80px)] flex flex-col">
                {/* Identity banner. The gradient and the two blurred discs are
                    the same treatment the page heroes use, so the dropdown
                    reads as part of the product rather than a stray panel. */}
                <div className="relative overflow-hidden bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-blue px-5 py-4 shrink-0">
                  <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                  <div className="pointer-events-none absolute -bottom-16 left-16 h-36 w-36 rounded-full bg-white/[0.07] blur-2xl" />
                  <div className="relative flex items-center gap-4">
                    <div className="relative shrink-0">
                      <NameAvatar name={user.name} fallback={user.email} src={user.avatarUrl} size="xl" className="bg-white dark:bg-white dark:text-brand-blue" />
                      {/* Presence dot, ringed in the banner's own blue rather
                          than white, so it reads as cut out of the avatar
                          instead of floating over it. */}
                      <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-success ring-2 ring-brand-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold truncate">{user.name || 'User'}</p>
                      <p className="text-white/80 text-sm truncate">{user.email}</p>
                      {/* Role and id sit on one wrapping row — at 320px the two
                          pills fit side by side for most names, and drop to a
                          second line rather than squashing when they do not. */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/15 text-white ring-1 ring-white/15">
                          {/* A crown for the account owner, a shield for everyone
                              else. The role is spelled out beside it, so the icon
                              only has to mark the one role that outranks the
                              rest.

                              Tested against `tenant_admin`, which is the role
                              `roleLabels` renders as "Owner" — there is no
                              'owner' member on `UserRole`, so comparing to that
                              string would have been permanently false. */}
                          {user.role === 'tenant_admin'
                            ? <Crown className="w-3 h-3" />
                            : <Shield className="w-3 h-3" />}
                          {user.roleDisplay || prettyRole(user.role)}
                        </span>

                        {/* User id — click to copy the FULL uuid. Shown short
                            because the full value is 36 characters; the title
                            carries it in full for anyone who would rather
                            select it by hand. */}
                        {userIdBadge && (
                          <button
                            type="button"
                            onClick={copyUserId}
                            title={`User ID: ${userIdBadge} (click to copy)`}
                            aria-label={`Copy user ID ${userIdBadge}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/15 text-white ring-1 ring-white/15 transition-colors hover:bg-white/25"
                          >
                            <Copy className="w-3 h-3" />
                            {/* Monospace so the id reads as an identifier and
                                its characters line up rather than kerning like
                                a word. */}
                            <span className="font-mono">{userIdBadge}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Organization — a card, but deliberately NOT a link and with
                    no chevron. It states which tenant you are signed in to;
                    "Company Profile" below is the row that goes somewhere, and
                    a chevron here would promise the same destination twice. */}
                {tenant && (
                  <div className="px-4 pt-3 pb-2.5 shrink-0">
                    <div className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50/80 px-2.5 py-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                        <Building2 className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-2xs leading-tight text-gray-500">Organization</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{tenant.name || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* The rows. Divided by hairlines rather than by spacing, so a
                    long list stays readable as it scrolls. */}
                <div className="max-h-[216px] flex-1 min-h-0 overflow-y-auto border-t border-gray-100 divide-y divide-gray-100">
                  {profileMenuItems
                    .filter(item => item.show !== false)
                    .map(({ id, icon: ItemIcon, title, subtitle, href, alwaysEnabled, permitted, deniedMessage }) => {
                      const subscriptionLocked = subscriptionExpired && !alwaysEnabled;
                      const permissionLocked = permitted === false;
                      const locked = subscriptionLocked || permissionLocked;
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            if (locked) return;
                            setShowUserMenu(false);
                            router.push(href);
                          }}
                          disabled={subscriptionLocked}
                          aria-disabled={locked}
                          title={!subscriptionLocked && permissionLocked ? (deniedMessage || PERMISSION_DENIED_MESSAGE) : undefined}
                          className={`w-full px-4 py-2.5 text-left flex items-center gap-2.5 transition-colors ${locked ? '' : 'group'} ${
                            subscriptionLocked ? 'opacity-40 cursor-not-allowed' : permissionLocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-brand-blue/[0.04]'
                          }`}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 transition-colors group-hover:bg-brand-blue/15">
                            <ItemIcon className="w-4 h-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-gray-900 truncate">{title}</span>
                            <span className="block text-xs text-gray-500 truncate">{subtitle}</span>
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-300 transition-colors group-hover:text-brand-blue" />
                        </button>
                      );
                    })}
                </div>

                {/* Sign Out — its own tinted panel rather than another row,
                    because it is the one action here that ends the session. The
                    subtitle says what will happen, so it is never a mystery
                    click. */}
                <div className="border-t border-gray-100 p-2.5 shrink-0">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 rounded-lg border border-destructive-line bg-destructive-subtle/70 px-2.5 py-2 text-left transition-colors hover:bg-destructive-subtle hover:border-destructive/40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-destructive">
                      <LogOut className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-destructive">Sign Out</span>
                      <span className="block text-2xs leading-tight text-destructive/80">You will be signed out of your account</span>
                    </span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </header>
  );
}
