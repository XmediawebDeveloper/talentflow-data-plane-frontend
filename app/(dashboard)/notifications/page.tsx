'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  Bell,
  CheckCircle,
  AlertCircle,
  Info,
  Loader2,
  Check,
  Trash2,
  Filter,
  RefreshCw,
} from 'lucide-react';
import notificationService, { Notification } from '@/lib/services/notificationService';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';

export default function NotificationsPage() {
  const router = useRouter();
  const { isTenantAdmin } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  // Persist scroll + filter state so returning to this page restores it exactly.
  const rootRef = useScrollRestoration<HTMLElement>('notifications', !loading);
  useListStatePersistence(
    'notifications',
    { filter, categoryFilter },
    (s) => {
      if (s.filter === 'all' || s.filter === 'unread') setFilter(s.filter);
      if (typeof s.categoryFilter === 'string') setCategoryFilter(s.categoryFilter);
    },
  );

  const fetchNotifications = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const offset = reset ? 0 : notifications.length;
      const response = await notificationService.getNotifications(
        20,
        offset,
        filter === 'unread',
        categoryFilter
      );

      if (reset) {
        setNotifications(response.notifications);
      } else {
        setNotifications(prev => [...prev, ...response.notifications]);
      }
      setUnreadCount(response.unread_count);
      setTotal(response.total);
      setHasMore(response.has_more);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, categoryFilter, notifications.length]);

  useEffect(() => {
    fetchNotifications(true);
  }, [filter, categoryFilter]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead([notificationId]);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await notificationService.deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setTotal(prev => prev - 1);
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await handleMarkAsRead(notification.id);
    }
    if (isTenantAdmin && notification.action_url) {
      router.push(notification.action_url);
    }
  };

  const getNotificationStyle = (type: string) => {
    switch (type) {
      case 'success':
        return {
          icon: CheckCircle,
          bgColor: 'bg-green-100',
          iconColor: 'text-green-600',
          borderColor: 'border-green-500',
        };
      case 'warning':
        return {
          icon: AlertCircle,
          bgColor: 'bg-orange-100',
          iconColor: 'text-orange-600',
          borderColor: 'border-orange-500',
        };
      case 'error':
        return {
          icon: AlertCircle,
          bgColor: 'bg-red-100',
          iconColor: 'text-red-600',
          borderColor: 'border-red-500',
        };
      default:
        return {
          icon: Info,
          bgColor: 'bg-gray-100',
          iconColor: 'text-gray-600',
          borderColor: 'border-gray-400',
        };
    }
  };

  const categories = [
    { value: undefined, label: 'All Categories' },
    { value: 'resume', label: 'Resumes' },
    { value: 'assessment', label: 'Assessments' },
    { value: 'candidate', label: 'Candidates' },
    { value: 'team', label: 'Team' },
    { value: 'system', label: 'System' },
    { value: 'billing', label: 'Billing' },
  ];

  return (
    <main ref={rootRef} className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
      <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Notifications' }]} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4 h-4 text-brand-blue" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">Notifications</h1>
            <p className="text-xs sm:text-sm text-gray-500">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'} · {total} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => fetchNotifications(true)}
            className="p-2 text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
            aria-label="Refresh" title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="px-4 py-2 text-sm font-medium bg-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2 transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-5">
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filter === 'all'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filter === 'unread'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Unread
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <select
            value={categoryFilter || ''}
            onChange={(e) => setCategoryFilter(e.target.value || undefined)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue w-full sm:w-auto text-black"
          >
            {categories.map(cat => (
              <option key={cat.value || 'all'} value={cat.value || ''}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 sm:py-16 text-center px-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 mb-3 sm:mb-4 rounded-full bg-muted/50 border border-border flex items-center justify-center">
              <Bell className="w-6 h-6 sm:w-7 sm:h-7 text-muted-foreground" />
            </div>
            <p className="text-base sm:text-lg font-semibold text-foreground mb-1">No notifications</p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {filter === 'unread' ? 'All notifications have been read' : "You're all caught up!"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => {
              const style = getNotificationStyle(notification.type);
              const IconComponent = style.icon;

              return (
                <div
                  key={notification.id}
                  className={`p-3 sm:p-4 hover:bg-brand-blue/[0.04] transition-colors ${
                    !notification.is_read ? 'bg-brand-blue/[0.04]' : ''
                  }`}
                >
                  <div className="flex gap-2.5 sm:gap-4">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 ${style.bgColor} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <IconComponent className={`w-4 h-4 sm:w-5 sm:h-5 ${style.iconColor}`} />
                    </div>

                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start justify-between gap-2 sm:gap-4 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className={`text-xs sm:text-sm truncate ${notification.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>
                            {notification.title}
                          </p>
                          {!notification.is_read && (
                            <span className="w-2 h-2 bg-brand-blue rounded-full flex-shrink-0"></span>
                          )}
                        </div>
                        <span className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap flex-shrink-0">{notification.time_ago}</span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-600 mb-2 line-clamp-2">{notification.message}</p>
                      <div className="flex items-center gap-3">
                        {isTenantAdmin && notification.action_label && (
                          <span className="text-xs text-brand-blue font-medium hover:underline">
                            {notification.action_label}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 capitalize">{notification.category}</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start gap-1 flex-shrink-0">
                      {!notification.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(notification.id);
                          }}
                          className="p-1 sm:p-1.5 text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 rounded transition-colors"
                          aria-label="Mark as read" title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(notification.id);
                        }}
                        className="p-1 sm:p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        aria-label="Delete" title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Load More */}
        {hasMore && !loading && (
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={() => fetchNotifications(false)}
              disabled={loadingMore}
              className="w-full py-2 text-sm font-medium text-brand-blue bg-white border border-gray-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load More'
              )}
            </button>
          </div>
        )}
      </div>
      </div>
      </div>
    </main>
  );
}
