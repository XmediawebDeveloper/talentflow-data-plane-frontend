import { Bell, Search, Settings, ChevronDown, HelpCircle, LogOut, User, Shield, Zap, CreditCard, Book, MessageCircle, FileText, Video, Mail, Phone, ExternalLink, CheckCircle, Clock, AlertCircle, Info, Users, TrendingUp, Activity, Command, Loader2, X, Wifi, WifiOff, Building2, Menu } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { User as UserType } from '@/lib/types/tenant';
import NotificationCenter from './NotificationCenter';
import QuickActions from './QuickActions';
// FIX-010: Import Tooltip for icon buttons
import { Tooltip } from '@/components/ui/tooltip';
import { useQuota } from '@/contexts/QuotaContext';
import notificationService, { Notification } from '@/lib/services/notificationService';
import { useRouter } from 'next/navigation';
import { useNotificationWebSocket } from '@/hooks/useNotificationWebSocket';
import { useAuth } from '@/lib/hooks/useAuth';

interface HeaderProps {
  onLogout: () => void;
  user: UserType | null;
  tenant?: any;
  onOpenTour?: () => void;
  onOpenShortcuts?: () => void;
  onOpenSettings?: () => void;
  onMenuClick?: () => void;
  isMobileMenuOpen?: boolean;
}

export default function Header({ onLogout, user, tenant, onOpenTour, onOpenShortcuts, onOpenSettings, onMenuClick, isMobileMenuOpen }: HeaderProps) {
  if (!user) return null;
  const router = useRouter();
  const { refreshUser } = useAuth();
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
    const handlePlanChange = () => {
      console.log('[Header] Plan changed, refreshing quota and notifications...');
      fetchQuotaStatus();
      // Refresh notification count after a delay to pick up backend-created notifications
      setTimeout(() => fetchNotificationCount(), 2000);
    };

    const handleUnitsConsumed = () => {
      console.log('[Header] Units consumed, refreshing quota...');
      fetchQuotaStatus();
    };

    window.addEventListener('planChanged', handlePlanChange);
    window.addEventListener('unitsConsumed', handleUnitsConsumed);
    return () => {
      window.removeEventListener('planChanged', handlePlanChange);
      window.removeEventListener('unitsConsumed', handleUnitsConsumed);
    };
  }, [user]);

  // Get JWT token for WebSocket
  const [wsToken, setWsToken] = useState<string | null>(null);

  useEffect(() => {
    // Get token from localStorage (same as auth service uses)
    const token = localStorage.getItem('accessToken');
    console.log('[Header] wsToken fetched from localStorage:', token ? `✅ present (${token.substring(0, 20)}...)` : '❌ null/missing');
    setWsToken(token);
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

    // Skip if subscription is explicitly expired (no notifications needed for renewal flow)
    // NOTE: Do NOT skip when quotaData is null/loading — that blocks initial fetch for new signups
    if (quotaData && quotaData.subscription_status === 'expired') {
      console.log('[Header] Skipping notification count - subscription expired');
      return;
    }

    try {
      const response = await notificationService.getNotificationCounts();
      setUnreadCount(response.unread);
    } catch (error) {
      console.error('Error fetching notification count:', error);
    }
  }, [user, quotaData]);

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
      console.log('[Header] onPermissionsUpdated triggered via WebSocket — calling refreshUser()');
      refreshUser();
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
    if (notification.action_url) {
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
  
  // Calculate total units across all quota types (RU + RS + AS + AIU + max_seats)
  const calculateTotalUnits = () => {
    if (!quotaData?.quotas) return { remaining: 0, limit: 0, used: 0 };

    const quotas = quotaData.quotas;
    // Include all unit types: Resume Upload, Resume Scoring, Assessment, AI Interview, Max Users
    const allUnitTypes = ['RU', 'RS', 'AS', 'AIU', 'max_seats'];

    let totalRemaining = 0;
    let totalLimit = 0;
    let totalUsed = 0;

    allUnitTypes.forEach(quotaType => {
      if (quotas[quotaType]) {
        const quota = quotas[quotaType];
        // Skip unlimited quotas in the calculation
        if (quota.is_unlimited) return;

        totalRemaining += quota.total_remaining || 0;
        totalLimit += (quota.subscription?.limit || 0) + (quota.addon?.total_purchased || 0);
        totalUsed += quota.subscription?.used || 0;
      }
    });

    return { remaining: totalRemaining, limit: totalLimit, used: totalUsed };
  };

  const totalUnits = calculateTotalUnits();

  // Determine plan name based on status
  const getPlanDisplayName = () => {
    if (loadingQuota) return 'Loading...';
    if (tenantStatus === 'PENDING') return 'Account Pending';
    if (tenantStatus === 'SUSPENDED') return 'Account Suspended';
    if (tenantStatus === 'LOCKED') return 'Account Locked';
    if (quotaError) return 'Unable to load';
    return quotaData?.plan_name || 'No plan data';
  };

  const planName = getPlanDisplayName();
  const usagePercentage = totalUnits.limit > 0 ? ((totalUnits.used / totalUnits.limit) * 100) : 0;
  const isPendingStatus = tenantStatus === 'PENDING' || tenantStatus === 'SUSPENDED' || tenantStatus === 'LOCKED';

  const roleLabels = {
    tenant_admin: 'Owner',
    recruiter: 'Recruiter',
    viewer: 'Viewer',
  };

  const roleBadgeColors = {
    tenant_admin: 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white border-purple-600',
    recruiter: 'bg-gray-100 text-gray-600 border-gray-200',
    viewer: 'bg-gray-50 text-gray-500 border-gray-200',
  };
  
  return (
    <header className="h-14 sm:h-16 lg:h-[72px] bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-4 lg:px-8 shadow-sm">
      {/* Hamburger Menu Button - Only on Mobile */}
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors mr-2"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {isMobileMenuOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </button>
      )}

      {/* Search Bar - Hidden on mobile, visible on desktop */}
      <div className="hidden lg:flex items-center flex-1 max-w-2xl">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search candidates, jobs, assessments..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-gray-50 hover:bg-white transition-colors text-gray-900"
          />
        </div>
      </div>

      {/* Spacer for mobile to push icons to the right */}
      <div className="flex-1 lg:hidden" />

      <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 lg:ml-8">
        {/* FIX-010: Keyboard Shortcuts Button with Tooltip - Hidden on mobile */}
        {onOpenShortcuts && (
          <Tooltip content="Keyboard Shortcuts (Cmd/Ctrl + /)" position="bottom">
            <button
              onClick={onOpenShortcuts}
              className="hidden sm:block p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-300 hover:border-gray-400"
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
            className="hidden lg:flex px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 hover:shadow-lg transition-all duration-200 items-center gap-2 group"
            title="Take a quick tour"
          >
            <Zap className="w-4 h-4 group-hover:animate-pulse" />
            <span className="text-sm font-medium">Quick Tour</span>
          </button>
        )}

        {/* Plan & Unit Balance Display - Moved before icons - Only show if user has permission - Hidden on mobile */}
        {hasQuotaPermission && (
          <div className="hidden md:flex items-center gap-2 lg:gap-3 px-2 sm:px-3 lg:px-4 py-2 lg:py-2.5 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl">
            <div className="w-7 h-7 lg:w-9 lg:h-9 bg-white rounded-lg flex items-center justify-center shadow-sm border border-gray-200">
              <CreditCard className="w-4 h-4 lg:w-5 lg:h-5 text-gray-600" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-xs lg:text-sm font-semibold text-gray-900 truncate max-w-[100px] lg:max-w-[140px]" title={loadingQuota ? 'Loading...' : planName}>
                {loadingQuota ? 'Loading...' : planName}
              </span>
              {!loadingQuota && !quotaError && !isPendingStatus && (
                <div className="flex items-center gap-1 lg:gap-1.5">
                  <span className="text-xs lg:text-sm font-bold text-gray-700">{totalUnits.remaining.toLocaleString()}</span>
                  <span className="text-[10px] lg:text-xs text-gray-500">units left</span>
                </div>
              )}
              {isPendingStatus && (
                <span className="text-[10px] lg:text-xs text-orange-600 font-medium">
                  {tenantStatus}
                </span>
              )}
            </div>
            {!loadingQuota && !quotaError && !isPendingStatus && totalUnits.limit > 0 && (
              <div className="w-12 lg:w-16 h-2 bg-white/60 rounded-full overflow-hidden border border-gray-200">
                <div
                  className={`h-full rounded-full transition-all ${
                    usagePercentage > 90 ? 'bg-red-500' :
                    usagePercentage > 70 ? 'bg-yellow-500' : 'bg-gray-600'
                  }`}
                  style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                />
              </div>
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
              className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
              <div className="fixed inset-x-3 top-[60px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-20 max-h-[calc(100vh-80px)] overflow-y-auto">
                <div className="px-4 py-3 bg-gray-800 text-white">
                  <h3 className="font-medium flex items-center gap-2">
                    <HelpCircle className="w-5 h-5" />
                    Help & Support
                  </h3>
                  <p className="text-sm text-gray-300 mt-1">Get the help you need</p>
                </div>

                <div className="p-4">
                  {/* Quick Actions */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button
                      onClick={() => {
                        setShowHelpMenu(false);
                        router.push('/help');
                      }}
                      className="p-3 border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all group text-left"
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
                      className="p-3 border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all group text-left"
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
                        className="w-full text-left p-2 hover:bg-gray-50 rounded-lg transition-colors group"
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
                        className="w-full text-left p-2 hover:bg-gray-50 rounded-lg transition-colors group"
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
                        className="w-full text-left p-2 hover:bg-gray-50 rounded-lg transition-colors group"
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
                        className="w-full text-left p-2 hover:bg-gray-50 rounded-lg transition-colors group"
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
                        className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                      >
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                          <Mail className="w-4 h-4 text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">Email Support</div>
                          <div className="text-xs text-gray-500">support@talentflow.com</div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400" />
                      </a>
                      <a
                        href="tel:+18001234567"
                        className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                      >
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                          <Phone className="w-4 h-4 text-gray-600" />
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
                      className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
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
              className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
              <div className="fixed inset-x-3 top-[60px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-20">
                <div className="px-4 py-3 bg-gray-800 text-white">
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
                  <p className="text-sm text-gray-300 mt-1">Stay updated with latest activities</p>
                </div>

                {/* Filter Tabs */}
                <div className="flex border-b border-gray-200 bg-gray-50">
                  <button
                    onClick={() => setActiveNotificationTab('all')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                      activeNotificationTab === 'all'
                        ? 'text-gray-900 border-b-2 border-gray-800 bg-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    All ({notifications.length})
                  </button>
                  <button
                    onClick={() => setActiveNotificationTab('unread')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                      activeNotificationTab === 'unread'
                        ? 'text-gray-900 border-b-2 border-gray-800 bg-white'
                        : 'text-gray-600 hover:text-gray-900'
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
                            className={`w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors ${
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
                                {notification.action_label && (
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
                    className="flex-1 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Mark All Read
                  </button>
                  <button
                    onClick={() => {
                      setShowNotifications(false);
                      router.push('/notifications');
                    }}
                    className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                  >
                    View All
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* FIX-010: Settings with Tooltip - Hidden on mobile */}
        <Tooltip content="Settings" position="bottom">
          <button
            onClick={() => router.push('/settings/general-settings')}
            className="hidden sm:block p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
            className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 hover:bg-gray-100 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 transition-colors"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 lg:w-9 lg:h-9 rounded-full bg-gray-700 text-white flex items-center justify-center shadow-sm">
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
                <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-white/20 text-white flex items-center justify-center text-lg font-semibold ring-2 ring-white/30">
                      {(user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{user.name || 'User'}</p>
                      <p className="text-gray-300 text-sm truncate">{user.email}</p>
                      <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'tenant_admin'
                          ? 'bg-purple-500/20 text-purple-200 border border-purple-400/30'
                          : user.role === 'recruiter'
                          ? 'bg-blue-500/20 text-blue-200 border border-blue-400/30'
                          : 'bg-gray-500/20 text-gray-200 border border-gray-400/30'
                      }`}>
                        <Shield className="w-3 h-3" />
                        {roleLabels[user.role]}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Organization Info */}
                {tenant && (
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-600">Organization:</span>
                      <span className="font-medium text-gray-900 truncate">{tenant.name || 'N/A'}</span>
                    </div>
                  </div>
                )}

                {/* Quick Stats */}
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Your Permissions</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
                      user.permissions.can_manage_users ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'
                    }`}>
                      <Users className="w-3.5 h-3.5" />
                      <span>Manage Users</span>
                    </div>
                    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
                      user.permissions.can_view_analytics ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'
                    }`}>
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>Analytics</span>
                    </div>
                    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
                      user.permissions.can_manage_settings ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'
                    }`}>
                      <Settings className="w-3.5 h-3.5" />
                      <span>Settings</span>
                    </div>
                    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
                      user.is_tenant_admin ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'
                    }`}>
                      <Shield className="w-3.5 h-3.5" />
                      <span>Admin Access</span>
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="py-2">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      router.push('/settings/general-settings');
                    }}
                    className="w-full px-5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3 group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
                      <User className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Profile Settings</p>
                      <p className="text-xs text-gray-500">Update your personal information</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      router.push('/settings/security');
                    }}
                    className="w-full px-5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3 group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
                      <Shield className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Security</p>
                      <p className="text-xs text-gray-500">Password & authentication</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      router.push('/audits/activity');
                    }}
                    className="w-full px-5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3 group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
                      <Activity className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Activity Log</p>
                      <p className="text-xs text-gray-500">View your recent activity</p>
                    </div>
                  </button>
                  {hasQuotaPermission && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        router.push('/subscription/usage-quotas');
                      }}
                      className="w-full px-5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3 group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
                        <Zap className="w-4 h-4 text-gray-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Usage & Billing</p>
                        <p className="text-xs text-gray-500">View usage and manage subscription</p>
                      </div>
                    </button>
                  )}
                </div>

                {/* Sign Out */}
                <div className="border-t border-gray-100 p-3 bg-gray-50">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-100 transition-colors flex items-center justify-center gap-2 rounded-lg font-medium"
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
    </header>
  );
}