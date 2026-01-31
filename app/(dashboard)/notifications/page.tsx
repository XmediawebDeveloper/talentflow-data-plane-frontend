'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

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
    if (notification.action_url) {
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
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'} · {total} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchNotifications(true)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filter === 'all'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filter === 'unread'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Unread
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={categoryFilter || ''}
            onChange={(e) => setCategoryFilter(e.target.value || undefined)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-500"
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Bell className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">No notifications</p>
            <p className="text-sm text-gray-400 mt-1">
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
                  className={`p-4 hover:bg-gray-50 transition-colors ${
                    !notification.is_read ? 'bg-blue-50/30' : ''
                  }`}
                >
                  <div className="flex gap-4">
                    <div className={`w-10 h-10 ${style.bgColor} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <IconComponent className={`w-5 h-5 ${style.iconColor}`} />
                    </div>

                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm ${notification.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>
                            {notification.title}
                          </p>
                          {!notification.is_read && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">{notification.time_ago}</span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                      <div className="flex items-center gap-3">
                        {notification.action_label && (
                          <span className="text-xs text-gray-800 font-medium hover:underline">
                            {notification.action_label}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 capitalize">{notification.category}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-1">
                      {!notification.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(notification.id);
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="Mark as read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(notification.id);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
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
              className="w-full py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
  );
}
