import { Bell, Settings, ChevronDown, HelpCircle, LogOut, User, Shield, Zap, CreditCard, Book, FileText, Video, Mail, Phone, ExternalLink, CheckCircle, Clock, AlertCircle, Info, Activity, Command, Loader2, X, Wifi, WifiOff, Building2, Menu, Moon, Sun } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { User as UserType } from '@/lib/types/tenant';
import NotificationCenter from './NotificationCenter';
import QuickActions from './QuickActions';
import GlobalSearch from './GlobalSearch';
// FIX-010: Import Tooltip for icon buttons
import { Tooltip } from '@/components/ui/tooltip';
import { useQuota } from '@/contexts/QuotaContext';
import notificationService, { Notification } from '@/lib/services/notificationService';
import { useRouter } from 'next/navigation';
import { useNotificationWebSocket } from '@/hooks/useNotificationWebSocket';
import { useAuth } from '@/lib/hooks/useAuth';
import { toast } from 'sonner';

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
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const [tenantStatus, setTenantStatus] = useState<string | null>(null);

  // Notification state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [activeNotificationTab, setActiveNotificationTab] = useState<'all' | 'unread'>('all');

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

  // Labels for each quota key shown in the plan dropdown
  const quotaLabels: Record<string, string> = {
    RU: 'Resume Uploads',
    RS: 'Resume Scoring',
    AS: 'Assessments',
    AIU: 'AI Interviews',
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

  const roleLabels = {
    tenant_admin: 'Owner',
    recruiter: 'Recruiter',
    viewer: 'Viewer',
  };

  const roleBadgeColors = {
    tenant_admin: 'bg-brand-blue text-white',
    recruiter: 'bg-brand-blue/10 text-brand-blue',
    viewer: 'bg-gray-100 text-gray-600',
  };

  return (
    <header className="h-14 sm:h-16 lg:h-[72px] bg-white border-b border-gray-200">
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
      <Link href="/dashboard" prefetch={false} aria-label="TalentFlow home" className="flex items-center mr-3 sm:mr-4 lg:mr-6 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/talent_flow_logo.png" alt="TalentFlow" className="h-8 sm:h-10 lg:h-12 w-auto" />
      </Link>

      {/* Global Search Bar - Hidden on mobile, visible on desktop */}
      <GlobalSearch className="hidden lg:flex items-center flex-1 max-w-sm" />

      {/* Spacer for mobile to push icons to the right */}
      <div className="flex-1 lg:hidden" />

      <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 lg:ml-8">
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
          <div className="relative hidden md:block">
            <button
              onClick={() => {
                setShowPlanMenu(!showPlanMenu);
                setShowHelpMenu(false);
                setShowNotifications(false);
                setShowUserMenu(false);
              }}
              className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-2.5 py-1 lg:py-1.5 bg-white border border-gray-200 rounded-lg hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-colors"
            >
              <div className="w-6 h-6 lg:w-7 lg:h-7 bg-brand-blue/10 rounded-md flex items-center justify-center">
                <CreditCard className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-brand-blue" />
              </div>
              <div className="flex flex-col min-w-0 text-left">
                <span className="text-[11px] lg:text-xs font-semibold text-gray-900 truncate max-w-[80px] lg:max-w-[110px] leading-tight" title={loadingQuota ? 'Loading...' : planName}>
                  {loadingQuota ? 'Loading...' : planName}
                </span>
                {!loadingQuota && !quotaError && !isPendingStatus && !isExpiredSubscription && (
                  <div className="flex items-center gap-1 leading-tight">
                    <span className="text-[11px] lg:text-xs font-bold text-gray-700">{totalUnits.remaining.toLocaleString()}</span>
                    <span className="text-[9px] lg:text-[10px] text-gray-500">units left</span>
                  </div>
                )}
                {isPendingStatus && (
                  <span className="text-[9px] lg:text-[10px] text-orange-600 font-medium">
                    {tenantStatus}
                  </span>
                )}
              </div>
              {!loadingQuota && !quotaError && !isPendingStatus && !isExpiredSubscription && totalUnits.limit > 0 && (
                <div className="w-10 lg:w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usagePercentage > 90 ? 'bg-red-500' :
                      usagePercentage > 70 ? 'bg-brand-orange' : 'bg-brand-blue'
                    }`}
                    style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                  />
                </div>
              )}
              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${showPlanMenu ? 'rotate-180' : ''}`} />
            </button>

            {showPlanMenu && !isExpiredSubscription && (
              <>
                {/* Backdrop + panel z-indices were z-10 / z-20, but the
                    dashboard's sticky tab row and content cards stack above
                    that, which is why the dropdown body bled through behind
                    them. Lift to z-40 / z-50 so the menu always renders on
                    top of in-page chrome. */}
                <div className="fixed inset-0 z-40" onClick={() => setShowPlanMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
                  {/* Header */}
                  <div className="px-4 py-3 bg-brand-blue text-white">
                    <h3 className="font-medium flex items-center gap-2 text-sm">
                      <CreditCard className="w-4 h-4" />
                      {planName}
                    </h3>
                    <p className="text-xs text-white/80 mt-0.5">Unit balance breakdown</p>
                  </div>

                  {/* Quota rows */}
                  <div className="p-3 space-y-2">
                    {quotaData?.quotas && (['RU', 'RS', 'AS', 'AIU'] as const).map(key => {
                      const quota = quotaData.quotas![key];
                      if (!quota) return null;
                      const isUnlimited = !!(quota as any).is_unlimited;
                      const remaining = isUnlimited ? null : ((quota.total_remaining as number) || 0);
                      const limit = isUnlimited ? null : ((quota.subscription?.limit as number || 0) + (quota.addon?.total_purchased || 0));
                      const used = (limit != null && remaining != null) ? limit - remaining : 0;
                      const pct = limit && limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
                      return (
                        <div key={key} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">{quotaLabels[key]}</span>
                            <span className="text-xs font-semibold text-gray-800">
                              {isUnlimited ? (
                                <span className="text-green-600">Unlimited</span>
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <span className="text-gray-500 font-normal">{used.toLocaleString()} used</span>
                                  <span className="text-gray-300">·</span>
                                  <span className="text-gray-800">Left {(remaining ?? 0).toLocaleString()}</span>
                                </span>
                              )}
                            </span>
                          </div>
                          {!isUnlimited && limit && limit > 0 && (
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-[width] ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-gray-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Total */}
                    {!loadingQuota && !quotaError && totalUnits.limit > 0 && (
                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">Total Remaining</span>
                        <span className="text-sm font-bold text-gray-900">{totalUnits.remaining.toLocaleString()}</span>
                      </div>
                    )}

                    {/* Users limit — excluded from total */}
                    {quotaData?.quotas?.max_seats && (() => {
                      const seats = quotaData.quotas!.max_seats!;
                      const isUnlimited = !!(seats as any).is_unlimited;
                      const remaining = isUnlimited ? null : ((seats.total_remaining as number) || 0);
                      const limit = isUnlimited ? null : ((seats.subscription?.limit as number || 0) + (seats.addon?.total_purchased || 0));
                      const used = (limit != null && remaining != null) ? limit - remaining : 0;
                      return (
                        <div className="pt-2 border-t border-dashed border-gray-200 flex flex-col gap-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500 font-medium">Users</span>
                            <span className="text-xs font-semibold text-gray-600">
                              {isUnlimited ? (
                                <span className="text-green-600">Unlimited</span>
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <span className="text-gray-500 font-normal">{used.toLocaleString()} used</span>
                                  <span className="text-gray-300">·</span>
                                  <span className="text-gray-600">Left {(remaining ?? 0).toLocaleString()}</span>
                                </span>
                              )}
                            </span>
                          </div>
                          <span className="text-[10px] italic text-gray-400">Excluded from the above total</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* FIX-010: Help & Support with Tooltip - Hidden on mobile */}
        <div className="relative hidden sm:block">
          <Tooltip content="Help & Support" position="bottom">
            <button
              onClick={() => {
                setShowHelpMenu(!showHelpMenu);
                setShowNotifications(false);
                setShowPlanMenu(false);
                setShowUserMenu(false);
              }}
              className="relative p-2 text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
              aria-label="Help & Support"
            >
              <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </Tooltip>

          {showHelpMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowHelpMenu(false)}
              ></div>
              <div className="fixed inset-x-3 top-[60px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-20 max-h-[calc(100vh-80px)] overflow-y-auto">
                <div className="px-4 py-3 bg-brand-blue text-white">
                  <h3 className="font-medium flex items-center gap-2">
                    <HelpCircle className="w-5 h-5" />
                    Help & Support
                  </h3>
                  <p className="text-sm text-white/80 mt-1">Get the help you need</p>
                </div>

                <div className="p-4">
                  {/* Quick Actions */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button
                      onClick={() => {
                        setShowHelpMenu(false);
                        router.push('/help');
                      }}
                      className="p-3 border border-gray-200 rounded-lg hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-colors group text-left"
                    >
                      <Book className="w-5 h-5 text-gray-700 mb-2" />
                      <div className="text-sm text-gray-900">Knowledge Base</div>
                      <div className="text-xs text-gray-500">Browse articles</div>
                    </button>
                    <button
                      onClick={() => {
                        setShowHelpMenu(false);
                        router.push('/help?article=getting-started');
                      }}
                      className="p-3 border border-gray-200 rounded-lg hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-colors group text-left"
                    >
                      <FileText className="w-5 h-5 text-gray-600 mb-2" />
                      <div className="text-sm text-gray-900">Documentation</div>
                      <div className="text-xs text-gray-500">Full guides</div>
                    </button>
                  </div>

                  {/* Popular Articles */}
                  <div className="mb-4">
                    <h4 className="text-sm text-gray-900 mb-2">Popular Articles</h4>
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          setShowHelpMenu(false);
                          router.push('/help?article=getting-started');
                        }}
                        className="w-full text-left p-2 hover:bg-brand-blue/5 rounded-lg transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-900 group-hover:text-gray-700">Getting Started with TalentFlow</div>
                            <div className="text-xs text-gray-500">5 min read</div>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setShowHelpMenu(false);
                          router.push('/help?article=upload-parse-resumes');
                        }}
                        className="w-full text-left p-2 hover:bg-brand-blue/5 rounded-lg transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-900 group-hover:text-gray-700">How to Upload & Parse Resumes</div>
                            <div className="text-xs text-gray-500">6 min read</div>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setShowHelpMenu(false);
                          router.push('/help?article=create-job-description');
                        }}
                        className="w-full text-left p-2 hover:bg-brand-blue/5 rounded-lg transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-900 group-hover:text-gray-700">How to Create a Job Description</div>
                            <div className="text-xs text-gray-500">8 min read</div>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setShowHelpMenu(false);
                          router.push('/help?article=create-assessments');
                        }}
                        className="w-full text-left p-2 hover:bg-brand-blue/5 rounded-lg transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-900 group-hover:text-gray-700">Creating & Managing Assessments</div>
                            <div className="text-xs text-gray-500">10 min read</div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Contact Options */}
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm text-gray-900 mb-3">Contact Support</h4>
                    <div className="space-y-2">
                      <a
                        href="mailto:support@talentflow.com"
                        className="w-full flex items-center gap-3 p-2 hover:bg-brand-blue/5 rounded-lg transition-colors text-left"
                      >
                        <div className="w-8 h-8 bg-brand-blue/10 rounded-md flex items-center justify-center">
                          <Mail className="w-4 h-4 text-brand-blue" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">Email Support</div>
                          <div className="text-xs text-gray-500">support@talentflow.com</div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400" />
                      </a>
                      <a
                        href="tel:+18001234567"
                        className="w-full flex items-center gap-3 p-2 hover:bg-brand-blue/5 rounded-lg transition-colors text-left"
                      >
                        <div className="w-8 h-8 bg-brand-blue/10 rounded-md flex items-center justify-center">
                          <Phone className="w-4 h-4 text-brand-blue" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">Phone Support</div>
                          <div className="text-xs text-gray-500">+1 (800) 123-4567</div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400" />
                      </a>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => {
                        setShowHelpMenu(false);
                        router.push('/support-tickets');
                      }}
                      className="flex-1 px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 transition-colors text-sm font-medium"
                    >
                      Open Support Ticket
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* FIX-010: Notifications with Tooltip */}
        <div className="relative">
          <Tooltip content="Notifications" position="bottom">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowHelpMenu(false);
                setShowPlanMenu(false);
                setShowUserMenu(false);
              }}
              className="relative p-2 text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {unreadCount > 0 && (
                <>
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
                  <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center font-medium text-[10px] sm:text-xs">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </>
              )}
            </button>
          </Tooltip>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowNotifications(false)}
              ></div>
              <div className="fixed inset-x-3 top-[60px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-20">
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
                    All ({notifications.length})
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

                <div className="max-h-96 overflow-y-auto">
                  {notificationsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                      <Bell className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm">No notifications</p>
                      <p className="text-xs text-gray-400 mt-1">You're all caught up!</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
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
            className="p-2 text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
            aria-label="Toggle dark mode"
          >
            {resolvedTheme === 'dark'
              ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
              : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
            }
          </button>
        </Tooltip>

        {/* FIX-010: Settings with Tooltip - Hidden on mobile */}
        <Tooltip content="Settings" position="bottom">
          <button
            onClick={() => router.push('/settings/general-settings')}
            className="hidden sm:block p-2 text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </Tooltip>

        <div className="hidden sm:block h-6 sm:h-8 w-px bg-gray-200 mx-1 sm:mx-2" />

        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowPlanMenu(false);
            }}
            className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 hover:bg-brand-blue/5 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 transition-colors"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 lg:w-9 lg:h-9 rounded-full bg-brand-blue text-white flex items-center justify-center">
              <span className="text-xs sm:text-sm">{(user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}</span>
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs lg:text-sm text-gray-900 truncate max-w-[80px] lg:max-w-none">{user.name || user.email || 'User'}</div>
              <div className="text-[10px] lg:text-xs text-gray-500">{roleLabels[user.role]}</div>
            </div>
            <ChevronDown className="hidden md:block w-3 h-3 lg:w-4 lg:h-4 text-gray-400" />
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              ></div>
              <div className="fixed inset-x-3 top-[60px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-20 max-h-[calc(100vh-80px)] overflow-y-auto">
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
                        {roleLabels[user.role]}
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
                <div className="py-2 max-h-[200px] overflow-y-auto">
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
                  {hasQuotaPermission && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        router.push('/subscription/usage-quotas');
                      }}
                      className="w-full px-5 py-2.5 text-left text-sm text-gray-700 hover:bg-brand-blue/5 transition-colors flex items-center gap-3 group"
                    >
                      <div className="w-8 h-8 rounded-md bg-brand-blue/10 group-hover:bg-brand-blue/15 flex items-center justify-center transition-colors">
                        <Zap className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Usage & Billing</p>
                        <p className="text-xs text-gray-500">View usage and manage subscription</p>
                      </div>
                    </button>
                  )}
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