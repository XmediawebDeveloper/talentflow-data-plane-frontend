import { Bell, X, CheckCircle, AlertCircle, Info, Clock, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export default function NotificationCenter({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAll,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'info':
        return <Info className="w-5 h-5 text-gray-800" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatISTDate(dateStr);
  };

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="fixed inset-x-3 top-[60px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 animate-scale-in max-h-[calc(100vh-80px)] overflow-y-auto">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-900">Notifications</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {notifications.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={onMarkAllAsRead}
                    className="text-gray-800 hover:text-gray-900"
                  >
                    Mark all as read
                  </button>
                  <span className="text-gray-300">•</span>
                  <button
                    onClick={onClearAll}
                    className="text-gray-600 hover:text-gray-700"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">No notifications</p>
                  <p className="text-xs text-gray-500 mt-1">You're all caught up!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`px-4 py-3 hover:bg-gray-50 transition-colors ${
                        !notification.read ? 'bg-gray-50/50' : ''
                      }`}
                      onClick={() => !notification.read && onMarkAsRead(notification.id)}
                    >
                      <div className="flex gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 mt-0.5">
                          {getIcon(notification.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className={`text-sm ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                                {notification.title}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                                {notification.message}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <Clock className="w-3 h-3" />
                                  {formatTime(notification.timestamp)}
                                </div>
                                {!notification.read && (
                                  <span className="w-2 h-2 bg-gray-800 rounded-full"></span>
                                )}
                              </div>
                            </div>

                            {/* Delete Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(notification.id);
                              }}
                              className="p-1 text-gray-400 hover:text-red-600 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Action Button */}
                          {notification.actionLabel && notification.onAction && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                notification.onAction?.();
                              }}
                              className="mt-2 text-xs text-gray-800 hover:text-gray-900"
                            >
                              {notification.actionLabel}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
