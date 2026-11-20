import React, { useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, Package, ShoppingCart, Clock, AlertCircle, Info } from 'lucide-react';
import { useNotificationStore } from '../../stores/notificationStore';
import type { Notification, NotificationCategory } from '../../types';
import { formatDistanceToNow } from 'date-fns';

const categoryIcon: Record<NotificationCategory, React.ReactNode> = {
  approval: <CheckCheck className="w-4 h-4 text-indigo-500" />,
  stock: <Package className="w-4 h-4 text-amber-500" />,
  payment: <ShoppingCart className="w-4 h-4 text-emerald-500" />,
  attendance: <Clock className="w-4 h-4 text-blue-500" />,
  system: <Info className="w-4 h-4 text-gray-500" />,
  sale: <ShoppingCart className="w-4 h-4 text-indigo-500" />,
};

const categoryBg: Record<NotificationCategory, string> = {
  approval: 'bg-indigo-50',
  stock: 'bg-amber-50',
  payment: 'bg-emerald-50',
  attendance: 'bg-blue-50',
  system: 'bg-gray-50',
  sale: 'bg-indigo-50',
};

const NotificationItem: React.FC<{
  notification: Notification;
  onRead: (id: string) => void;
}> = ({ notification, onRead }) => {
  return (
    <div
      className={`flex gap-3 p-3 rounded-xl transition-colors cursor-pointer hover:bg-gray-50 ${
        !notification.is_read ? 'bg-indigo-50/50' : ''
      }`}
      onClick={() => !notification.is_read && onRead(notification.id)}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${categoryBg[notification.category]}`}>
        {categoryIcon[notification.category] ?? <AlertCircle className="w-4 h-4 text-gray-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!notification.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
          {notification.title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
        <p className="text-xs text-gray-400 mt-1">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>
      {!notification.is_read && (
        <div className="w-2 h-2 rounded-full bg-indigo-600 mt-1.5 flex-shrink-0" />
      )}
    </div>
  );
};

const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, isOpen, setOpen, markAsRead, markAllAsRead, fetchNotifications } =
    useNotificationStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!isOpen)}
        className="relative p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <p className="text-xs text-gray-500">{unreadCount} unread</p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <Check className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="py-10 flex flex-col items-center text-gray-400">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} onRead={markAsRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
