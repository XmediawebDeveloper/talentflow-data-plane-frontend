import { ArrowUpRight, Bell, Calendar, ChevronDown, ClipboardList, Coins, FileSearch, FolderOpen, HelpCircle, LogOut, ShoppingCart, User, Users, Shield, Video, Zap, CreditCard, Book, FileText, CheckCircle, AlertCircle, Info, Activity, Command, Loader2, X, Building2, Menu, Moon, Sun } from 'lucide-react';
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
import brandLogo from '@/assets/brand/talent-flow-logo-header.webp';
import { useQuota } from '@/contexts/QuotaContext';
import notificationService, { Notification } from '@/lib/services/notificationService';
import { useRouter } from 'next/navigation';
import { useNotificationWebSocket } from '@/hooks/useNotificationWebSocket';
import { useAuth } from '@/lib/hooks/useAuth';
import { toast } from 'sonner';

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

export default function Header({ onLogout, user, tenant, onOpenTour, onOpenShortcuts, onOpenSettings, onMenuClick, isMobileMenuOpen, subscriptionExpired }: HeaderProps) {
  if (!user) return null;
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

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setNotificationsLoading(true);
    try {
      const response = await notificationService.getNotifications(
        20, 0, activeNotificationTab === 'unread'
      );
      setNotifications(response.notifications);
      setUnreadCount(response.unread_count);
      // Only the All tab's response counts everything; the Unread tab's total
      // is the unread subset, and taking it would shrink the All tab's label.
      if (activeNotificationTab === 'all') setTotalCount(response.total);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setNotificationsLoading(false);
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

  // Log WebSocket connection status changes
  useEffect(() => {
    console.log('[Header] WebSocket status — connected:', wsConnected, '| error:', wsError ?? 'none');
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
          bgColor: 'bg-green-100',
          iconColor: 'text-green-600',
          borderColor: 'border-green-500',
          labelColor: 'text-green-600',
          bgTint: 'bg-green-50/30',
        };
      case 'warning':
        return {
          icon: AlertCircle,
          bgColor: 'bg-orange-100',
          iconColor: 'text-orange-600',
          borderColor: 'border-orange-500',
          labelColor: 'text-orange-600',
          bgTint: 'bg-orange-50/30',
        };
      case 'error':
        return {
          icon: AlertCircle,
          bgColor: 'bg-red-100',
          iconColor: 'text-red-600',
          borderColor: 'border-red-500',
          labelColor: 'text-red-600',
          bgTint: 'bg-red-50/30',
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
        totalUsed += quota.subscription?.used || 0;
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

  return (
    <header className="h-14 sm:h-16 lg:h-[72px] bg-white border-b border-gray-200">
      <div className="mx-auto flex h-full w-full max-w-[1400px] items-center justify-between px-3 sm:px-4 md:px-8">
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
      <Link href="/dashboard" prefetch={false} aria-label="TalentFlow home" className="flex items-center mr-2 sm:mr-4 lg:mr-6 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brandLogo.src}
          alt="TalentFlow"
          width={brandLogo.width}
          height={brandLogo.height}
          className="h-7 sm:h-10 lg:h-12 w-auto"
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
          <button
            onClick={onOpenTour}
            className="hidden lg:flex px-3 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 transition-colors duration-200 items-center gap-2 group"
            aria-label="Take a quick tour" title="Take a quick tour"
          >
            <Zap className="w-4 h-4 group-hover:animate-pulse" />
            <span className="text-sm font-medium">Quick Tour</span>
          </button>
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
              <div className="w-6 h-6 rounded-md border border-brand-blue/10 bg-brand-blue/[0.07] shadow-sm shadow-brand-blue/5 flex items-center justify-center">
                <CreditCard className="w-3.5 h-3.5 text-brand-blue" strokeWidth={2.15} />
              </div>
              {/* Name + units hide on the smallest screens — the pill collapses
                  to icon + chevron so the header row still fits. */}
              <div className="hidden sm:flex flex-col min-w-0 text-left">
                <span className="text-[11px] lg:text-xs font-semibold text-slate-950 dark:text-slate-50 truncate max-w-[90px] md:max-w-[130px] lg:max-w-[170px] leading-tight" title={loadingQuota ? 'Loading...' : planName}>
                  {loadingQuota ? 'Loading...' : planName}
                </span>
                {!loadingQuota && !quotaError && !isPendingStatus && !isExpiredSubscription && (
                  <div className="flex items-center gap-1 leading-tight">
                    <span className="text-[11px] lg:text-xs font-bold text-brand-blue tabular-nums">{totalUnits.remaining.toLocaleString()}</span>
                    <span className="text-[9px] lg:text-[10px] text-gray-500 dark:text-slate-400">units left</span>
                  </div>
                )}
                {isPendingStatus && (
                  <span className="text-[9px] lg:text-[10px] text-orange-600 font-medium">
                    {tenantStatus}
                  </span>
                )}
              </div>
              {!loadingQuota && !quotaError && !isPendingStatus && !isExpiredSubscription && totalUnits.limit > 0 && (
                <div className="hidden sm:block w-10 lg:w-12 h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usagePercentage > 90 ? 'bg-red-500' :
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
                  <div className="px-2.5 py-2 sm:px-3.5 sm:py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 border-b border-gray-100">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand-blue text-white ring-1 ring-white/10 shadow-sm shadow-brand-blue/25 flex items-center justify-center flex-shrink-0">
                        <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs sm:text-[13px] font-bold text-gray-900 truncate">{planName}</h3>
                        <div className="flex items-center gap-1 flex-wrap text-[10px] text-gray-500 mt-0.5">
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
                              <span className="text-green-600 font-medium">{planDaysLeft} days left</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowPlanMenu(false);
                        router.push('/subscription/current-plan');
                      }}
                      className="w-full sm:w-auto flex items-center justify-center gap-1 px-2 py-1 text-[10px] sm:text-[11px] font-semibold text-brand-blue bg-white border border-brand-blue/40 rounded-md hover:bg-brand-blue/5 hover:border-brand-blue/60 transition-colors flex-shrink-0 whitespace-nowrap"
                    >
                      Upgrade plan
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Unit balance breakdown */}
                  <div className="px-3 pt-2 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
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
                      const used = (limit != null && remaining != null) ? limit - remaining : 0;
                      const pct = limit && limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
                      return (
                        <div key={key} className="py-2 sm:py-2.5 flex items-center gap-2">
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.tile}`}>
                            <RowIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs sm:text-[13px] font-semibold text-gray-900 truncate">{meta.label}</div>
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
                            <span className="text-[11px] sm:text-xs font-semibold text-green-600">Unlimited</span>
                          ) : (
                            <>
                              <span className="text-[11px] sm:text-xs text-gray-600 tabular-nums whitespace-nowrap min-w-[50px] sm:min-w-[56px] text-right">
                                {used.toLocaleString()} used
                              </span>
                              <span className="w-px h-4 bg-gray-200 flex-shrink-0" />
                              <span className={`text-[11px] sm:text-xs font-bold tabular-nums whitespace-nowrap min-w-[56px] sm:min-w-[64px] text-right ${meta.left}`}>
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
                            <div className="text-xs sm:text-[13px] font-semibold text-gray-900">Users</div>
                          </div>
                          {isUnlimited ? (
                            <span className="text-[11px] sm:text-xs font-semibold text-green-600">Unlimited</span>
                          ) : (
                            <>
                              <span className="text-[11px] sm:text-xs text-gray-600 tabular-nums whitespace-nowrap min-w-[50px] sm:min-w-[56px] text-right">
                                {used.toLocaleString()} used
                              </span>
                              <span className="w-px h-4 bg-gray-300 flex-shrink-0" />
                              <span className="text-[11px] sm:text-xs font-bold text-gray-900 tabular-nums whitespace-nowrap min-w-[56px] sm:min-w-[64px] text-right">
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
                    <span className="flex-1 min-w-0 text-xs sm:text-[13px] font-medium text-gray-900">Need extra units right away?</span>
                    <button
                      onClick={() => {
                        setShowPlanMenu(false);
                        router.push('/subscription/current-plan?section=usage-quotas');
                      }}
                      className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex-shrink-0"
                    >
                      Purchase Add-ons
                      <ShoppingCart className="w-3.5 h-3.5" />
                    </button>
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
                    className="absolute inset-0 rounded-full bg-red-500/60 animate-ping motion-reduce:hidden"
                    aria-hidden="true"
                  />
                  <span
                    className="relative flex items-center justify-center min-w-[0.875rem] sm:min-w-[1rem] h-3.5 sm:h-4 px-[3px] sm:px-1 bg-red-500 text-white rounded-full ring-1 ring-white font-semibold text-[9px] sm:text-[10px] leading-none tabular-nums"
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
                        <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-yellow-400'}`}></span>
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
                  <button
                    onClick={handleMarkAllAsRead}
                    disabled={unreadCount === 0}
                    className="flex-1 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Mark All Read
                  </button>
                  <button
                    onClick={() => {
                      setShowNotifications(false);
                      router.push('/notifications');
                    }}
                    className="flex-1 px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 transition-colors text-sm font-medium"
                  >
                    View All
                  </button>
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
            <div className="w-7 h-7 sm:w-8 sm:h-8 lg:w-9 lg:h-9 rounded-full bg-brand-blue text-white flex items-center justify-center">
              <span className="text-xs sm:text-sm">{(user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}</span>
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs lg:text-sm text-gray-900 truncate max-w-[80px] lg:max-w-none">{user.name || user.email || 'User'}</div>
              <div className="text-[10px] lg:text-xs text-gray-500">{prettyRole(user.role)}</div>
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
                  scrolled alongside the max-h-[200px] menu list inside it and
                  the dropdown showed two vertical bars side by side. The
                  `shrink-0` markers on the profile, org and logout rows were
                  written for a flex column that was never declared; with it
                  declared they hold their size and the menu list is what gives
                  way on a short viewport, so the logout button stays reachable
                  instead of being clipped by the overflow-hidden. */}
              <div className="fixed inset-x-3 top-[60px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-[85] max-h-[calc(100dvh-80px)] flex flex-col">
                {/* User Profile Header */}
                <div className="bg-brand-blue px-5 py-4 shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-white/15 text-white flex items-center justify-center text-lg font-semibold">
                      {(user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold truncate">{user.name || 'User'}</p>
                      <p className="text-white/80 text-sm truncate">{user.email}</p>
                      <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-white/15 text-white">
                        <Shield className="w-3 h-3" />
                        {prettyRole(user.role)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Organization Info */}
                {tenant && (
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-600">Organization:</span>
                      <span className="font-medium text-gray-900 truncate">{tenant.name || 'N/A'}</span>
                    </div>
                  </div>
                )}

                {/* Menu Items — shows ~3, rest accessible via scroll */}
                <div className="py-2 max-h-[200px] flex-1 min-h-0 overflow-y-auto">
                  <button
                    onClick={() => {
                      if (subscriptionExpired) return;
                      setShowUserMenu(false);
                      router.push('/settings/general-settings');
                    }}
                    disabled={subscriptionExpired}
                    className={`w-full px-5 py-2.5 text-left text-sm flex items-center gap-3 group transition-colors ${subscriptionExpired ? 'opacity-40 cursor-not-allowed' : 'text-gray-700 hover:bg-brand-blue/5'}`}
                  >
                    <div className="w-8 h-8 rounded-md bg-brand-blue/10 group-hover:bg-brand-blue/15 flex items-center justify-center transition-colors">
                      <User className="w-4 h-4 text-brand-blue" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Profile Settings</p>
                      <p className="text-xs text-gray-500">Update your personal information</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      if (subscriptionExpired) return;
                      setShowUserMenu(false);
                      router.push('/subscription/current-plan');
                    }}
                    disabled={subscriptionExpired}
                    className={`w-full px-5 py-2.5 text-left text-sm flex items-center gap-3 group transition-colors ${subscriptionExpired ? 'opacity-40 cursor-not-allowed' : 'text-gray-700 hover:bg-brand-blue/5'}`}
                  >
                    <div className="w-8 h-8 rounded-md bg-brand-blue/10 group-hover:bg-brand-blue/15 flex items-center justify-center transition-colors">
                      <CreditCard className="w-4 h-4 text-brand-blue" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Current Plan</p>
                      <p className="text-xs text-gray-500">Billing & subscription</p>
                    </div>
                  </button>
                  {(isTenantAdmin || hasPermission('canManageSettings')) && (
                    <button
                      onClick={() => {
                        if (subscriptionExpired) return;
                        setShowUserMenu(false);
                        router.push('/organization/company-profile');
                      }}
                      disabled={subscriptionExpired}
                      className={`w-full px-5 py-2.5 text-left text-sm flex items-center gap-3 group transition-colors ${subscriptionExpired ? 'opacity-40 cursor-not-allowed' : 'text-gray-700 hover:bg-brand-blue/5'}`}
                    >
                      <div className="w-8 h-8 rounded-md bg-brand-blue/10 group-hover:bg-brand-blue/15 flex items-center justify-center transition-colors">
                        <Building2 className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Company Profile</p>
                        <p className="text-xs text-gray-500">Organization details</p>
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (subscriptionExpired) return;
                      setShowUserMenu(false);
                      router.push('/audits/activity');
                    }}
                    disabled={subscriptionExpired}
                    className={`w-full px-5 py-2.5 text-left text-sm flex items-center gap-3 group transition-colors ${subscriptionExpired ? 'opacity-40 cursor-not-allowed' : 'text-gray-700 hover:bg-brand-blue/5'}`}
                  >
                    <div className="w-8 h-8 rounded-md bg-brand-blue/10 group-hover:bg-brand-blue/15 flex items-center justify-center transition-colors">
                      <Activity className="w-4 h-4 text-brand-blue" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Audit Log</p>
                      <p className="text-xs text-gray-500">View your recent activity</p>
                    </div>
                  </button>
                  {user.is_tenant_admin && (
                    <button
                      onClick={() => {
                        if (subscriptionExpired) return;
                        setShowUserMenu(false);
                        router.push('/audits/trail');
                      }}
                      disabled={subscriptionExpired}
                      className={`w-full px-5 py-2.5 text-left text-sm flex items-center gap-3 group transition-colors ${subscriptionExpired ? 'opacity-40 cursor-not-allowed' : 'text-gray-700 hover:bg-brand-blue/5'}`}
                    >
                      <div className="w-8 h-8 rounded-md bg-brand-blue/10 group-hover:bg-brand-blue/15 flex items-center justify-center transition-colors">
                        <FileText className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Audit Trail</p>
                        <p className="text-xs text-gray-500">Detailed system audit logs</p>
                      </div>
                    </button>
                  )}
                  {/* User Guide — the header's own guide button is hidden below
                      sm, so this is the only way to it on a phone. It goes
                      straight to /help rather than opening that dropdown, which
                      would render nothing at mobile widths. Ungated by
                      subscription, same as Support Tickets: someone whose plan
                      lapsed still needs the docs. */}
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      router.push('/help');
                    }}
                    className="w-full px-5 py-2.5 text-left text-sm text-gray-700 hover:bg-brand-blue/5 transition-colors flex items-center gap-3 group"
                  >
                    <div className="w-8 h-8 rounded-md bg-brand-blue/10 group-hover:bg-brand-blue/15 flex items-center justify-center transition-colors">
                      <Book className="w-4 h-4 text-brand-blue" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">User Guide</p>
                      <p className="text-xs text-gray-500">Guides, articles and how-tos</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      router.push('/support-tickets');
                    }}
                    className="w-full px-5 py-2.5 text-left text-sm text-gray-700 hover:bg-brand-blue/5 transition-colors flex items-center gap-3 group"
                  >
                    <div className="w-8 h-8 rounded-md bg-brand-blue/10 group-hover:bg-brand-blue/15 flex items-center justify-center transition-colors">
                      <HelpCircle className="w-4 h-4 text-brand-blue" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Support Tickets</p>
                      <p className="text-xs text-gray-500">Help & support requests</p>
                    </div>
                  </button>
                </div>

                {/* Sign Out */}
                <div className="border-t border-gray-200 p-3 bg-gray-50 shrink-0">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full px-4 py-2.5 text-sm text-red-600 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 transition-colors flex items-center justify-center gap-2 rounded-lg font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
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
