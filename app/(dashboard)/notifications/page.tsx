'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import FilterSelect from '@/components/ui/filter-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { showErrorToast } from '@/lib/utils/errorToast';
import { clickableProps } from '@/lib/a11y/clickableProps';
import { IconButton } from '@/components/ui/icon-button';

export default function NotificationsPage() {
  const router = useRouter();
  const { isTenantAdmin } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  /* Every notification, from the All filter's response — the Unread filter's
     `total` is only the unread subset. null until an All response lands, so
     the header never reads "0 total" before anything has loaded. */
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  // Bumped by the load-failure toast's Retry to re-run the first-page load.
  const [reloadKey, setReloadKey] = useState(0);

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

  /* Bumped by every reset (filter change, refresh, unmount), so a page still in
     flight from the previous filter — the mount fetch with defaults before the
     saved filter is restored, or a Load More — is dropped instead of replacing
     or being appended onto the new list. */
  const fetchSeqRef = useRef(0);
  useEffect(() => () => { fetchSeqRef.current += 1; }, []);

  const fetchNotifications = useCallback(async (reset = false) => {
    const seq = reset ? ++fetchSeqRef.current : fetchSeqRef.current;
    const isStale = () => seq !== fetchSeqRef.current;
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
        categoryFilter,
        { throwOnError: true },
      );
      if (isStale()) return;

      if (reset) {
        setNotifications(response.notifications);
      } else {
        setNotifications(prev => [...prev, ...response.notifications]);
      }
      setUnreadCount(response.unread_count);
      if (filter === 'all') setTotal(response.total);
      setHasMore(response.has_more);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      if (!isStale()) {
        showErrorToast(error, reset ? "Couldn't load notifications" : "Couldn't load more notifications", {
          id: 'notifications-load',
          // Retry the first page by re-running the load effect; Load More stays on screen to tap again.
          retry: reset ? () => setReloadKey((k) => k + 1) : undefined,
        });
      }
    } finally {
      // A stale run leaves the spinners to the run that replaced it.
      if (!isStale()) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [filter, categoryFilter, notifications.length]);

  useEffect(() => {
    fetchNotifications(true);
  }, [filter, categoryFilter, reloadKey]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead([notificationId]);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      // The header bell keeps its own count — tell it to refresh.
      window.dispatchEvent(new CustomEvent('notificationTrigger'));
    } catch (error) {
      console.error('Error marking as read:', error);
      showErrorToast(error, "Couldn't mark notification as read");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      window.dispatchEvent(new CustomEvent('notificationTrigger'));
    } catch (error) {
      console.error('Error marking all as read:', error);
      showErrorToast(error, "Couldn't mark all notifications as read");
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await notificationService.deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setTotal(prev => (prev === null ? prev : Math.max(0, prev - 1)));
      window.dispatchEvent(new CustomEvent('notificationTrigger'));
    } catch (error) {
      console.error('Error deleting notification:', error);
      showErrorToast(error, "Couldn't delete notification");
    }
  };

  // Clears everything the current filter shows (All/Unread + category).
  const handleClearAll = async () => {
    setConfirmClearAll(false);
    setClearingAll(true);
    try {
      await notificationService.deleteAllNotifications({
        unreadOnly: filter === 'unread',
        category: categoryFilter,
      });
      window.dispatchEvent(new CustomEvent('notificationTrigger'));
      if (filter === 'all' && !categoryFilter) {
        // Everything is gone — no need to refetch.
        ++fetchSeqRef.current;
        setNotifications([]);
        setHasMore(false);
        setUnreadCount(0);
        setTotal(0);
      } else {
        // Only a subset was removed; refetch for accurate counts.
        await fetchNotifications(true);
        if (filter !== 'all') {
          const all = await notificationService.getNotifications(1, 0);
          setTotal(all.total);
        }
      }
    } catch (error) {
      console.error('Error clearing notifications:', error);
      showErrorToast(error, "Couldn't clear notifications");
    } finally {
      setClearingAll(false);
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

  // One removable tag per active filter. The All/Unread switch is the page's
  // main view toggle (always visible, always has a value), so it isn't one.
  const activeFilterChips: FilterChip[] = [
    !!categoryFilter && {
      key: 'category',
      label: 'Category',
      value: categories.find(cat => cat.value === categoryFilter)?.label ?? categoryFilter,
      onRemove: () => setCategoryFilter(undefined),
    },
  ].filter(Boolean) as FilterChip[];

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
      <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Notifications' }]} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4 h-4 text-brand-blue" />
          </div>
          <div>
            <h1 className="tf-page-title">Notifications</h1>
            <p className="tf-body-muted">
              {loading && total === null
                ? 'Loading…'
                : <>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}{total !== null && ` · ${total} total`}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <IconButton bare label="Refresh"
            onClick={() => fetchNotifications(true)}
            className="p-2 text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </IconButton>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="tf-btn tf-btn-primary px-4 py-2 text-sm bg-brand-blue shadow-md shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2 transition-colors flex gap-1.5 whitespace-normal justify-start"
            >
              <Check className="w-4 h-4" />
              Mark All Read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={() => setConfirmClearAll(true)}
              disabled={clearingAll}
              className="tf-btn px-4 py-2 text-sm text-red-600 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 transition-colors flex gap-1.5 items-center disabled:opacity-50"
            >
              {clearingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-5">
        <div role="tablist" aria-label="Notification filter" className="flex bg-gray-100 rounded-lg p-1">
          <button
            role="tab"
            aria-selected={filter === 'all'}
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
            role="tab"
            aria-selected={filter === 'unread'}
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
          <FilterSelect
            value={categoryFilter || ''}
            onChange={(v) => setCategoryFilter(v || undefined)}
            options={categories.map(cat => ({ value: cat.value || '', label: cat.label }))}
            className="px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg text-black"
          />
        </div>
      </div>
      {/* Active filter tags — the filter row's mb-5 is pulled back so they sit
          12px under it, keeping the same gap to the list. */}
      {activeFilterChips.length > 0 && (
        <FilterChips className="-mt-2 mb-5" chips={activeFilterChips} />
      )}

      {/* Notifications List */}
      <div className="tf-card-soft overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10 tf-loader-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 sm:py-16 text-center px-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 mb-3 sm:mb-4 rounded-full bg-muted/50 border border-border flex items-center justify-center">
              <Bell className="w-6 h-6 sm:w-7 sm:h-7 text-muted-foreground" />
            </div>
            <p className="text-base sm:text-lg font-semibold text-foreground mb-1">No notifications</p>
            <p className="text-sm text-muted-foreground">
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

                    <div {...clickableProps}
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start justify-between gap-2 sm:gap-4 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className={`text-sm truncate ${notification.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>
                            {notification.title}
                          </p>
                          {!notification.is_read && (
                            <span className="w-2 h-2 bg-brand-blue rounded-full flex-shrink-0"></span>
                          )}
                        </div>
                        <span className="tf-meta whitespace-nowrap flex-shrink-0">{notification.time_ago}</span>
                      </div>
                      <p className="tf-body-secondary mb-2 line-clamp-2">{notification.message}</p>
                      <div className="flex items-center gap-3">
                        {isTenantAdmin && notification.action_label && (
                          <span className="text-xs text-brand-blue font-medium hover:underline">
                            {notification.action_label}
                          </span>
                        )}
                        <span className="tf-hint capitalize">{notification.category}</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start gap-1 flex-shrink-0">
                      {!notification.is_read && (
                        <IconButton bare label="Mark as read"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(notification.id);
                          }}
                          className="p-1 sm:p-1.5 text-gray-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded transition-colors"
                        >
                          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </IconButton>
                      )}
                      <IconButton bare label="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(notification.id);
                        }}
                        className="p-1 sm:p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </IconButton>
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
      <ConfirmationDialog
        isOpen={confirmClearAll}
        onClose={() => setConfirmClearAll(false)}
        onConfirm={handleClearAll}
        title="Clear notifications?"
        description={
          filter === 'all' && !categoryFilter
            ? 'This will permanently delete all your notifications. This cannot be undone.'
            : `This will permanently delete all ${filter === 'unread' ? 'unread ' : ''}${
                categoryFilter ? `${categories.find(c => c.value === categoryFilter)?.label ?? categoryFilter} ` : ''
              }notifications matching the current filter. This cannot be undone.`
        }
        confirmText="Delete"
        variant="danger"
      />
    </main>
  );
}
