import { useCallback, useEffect, useState } from 'react';
import { AppNotification } from '../types';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, subscribeToNotifications, todayLocalDateString } from '../lib/staffApi';

/**
 * Backs the notification bell: loads notifications for a property, scoped
 * to one calendar day (defaults to today — see fetchNotifications), then
 * stays live via Supabase Realtime (see notify_new_order /
 * notify_guest_request triggers in 0007_notifications.sql) so a new order
 * or urgent request shows up without a manual refresh or poll. The
 * Realtime handler only prepends a pushed row while viewing today — a row
 * that just happened can't belong to whatever past date is on screen.
 */
export function useNotifications(propertyId: string | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayLocalDateString());

  const reload = useCallback(() => {
    if (!propertyId) return;
    setLoading(true);
    fetchNotifications(propertyId, date)
      .then(setNotifications)
      .catch(err => console.warn('Failed to load notifications:', err))
      .finally(() => setLoading(false));
  }, [propertyId, date]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = subscribeToNotifications(propertyId, (row) => {
      if (date !== todayLocalDateString()) return;
      setNotifications(prev => [row, ...prev]);
    });
    return unsubscribe;
  }, [propertyId, date]);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    markNotificationRead(id).catch(err => console.warn('Failed to mark notification read:', err));
  }, []);

  const markAllRead = useCallback(() => {
    if (!propertyId) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    markAllNotificationsRead(propertyId).catch(err => console.warn('Failed to mark all notifications read:', err));
  }, [propertyId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, loading, markRead, markAllRead, date, setDate };
}

/** Same idea, but merged across every property an owner runs — for OwnerApp's header bell, where there's no single propertyId. */
export function usePortfolioNotifications(propertyIds: string[]) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [date, setDate] = useState(todayLocalDateString());
  const key = propertyIds.join(',');

  useEffect(() => {
    if (propertyIds.length === 0) { setNotifications([]); return; }
    Promise.all(propertyIds.map(id => fetchNotifications(id, date, 30)))
      .then(lists => setNotifications(lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
      .catch(err => console.warn('Failed to load portfolio notifications:', err));

    const unsubscribes = propertyIds.map(id =>
      subscribeToNotifications(id, (row) => {
        if (date !== todayLocalDateString()) return;
        setNotifications(prev => [row, ...prev]);
      })
    );
    return () => unsubscribes.forEach(fn => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, date]);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    markNotificationRead(id).catch(err => console.warn('Failed to mark notification read:', err));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, markRead, date, setDate };
}
