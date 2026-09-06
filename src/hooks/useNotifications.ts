import { useCallback, useEffect, useState } from 'react';
import { AppNotification } from '../types';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from '../lib/staffApi';

/**
 * Backs the notification bell: loads recent notifications for a property,
 * then stays live via Supabase Realtime (see notify_new_order /
 * notify_guest_request triggers in 0007_notifications.sql) so a new order
 * or urgent request shows up without a manual refresh or poll.
 */
export function useNotifications(propertyId: string | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!propertyId) return;
    fetchNotifications(propertyId)
      .then(setNotifications)
      .catch(err => console.warn('Failed to load notifications:', err))
      .finally(() => setLoading(false));
  }, [propertyId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = subscribeToNotifications(propertyId, (row) => {
      setNotifications(prev => [row, ...prev].slice(0, 30));
    });
    return unsubscribe;
  }, [propertyId]);

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

  return { notifications, unreadCount, loading, markRead, markAllRead };
}

/** Same idea, but merged across every property an owner runs — for OwnerApp's header bell, where there's no single propertyId. */
export function usePortfolioNotifications(propertyIds: string[]) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const key = propertyIds.join(',');

  useEffect(() => {
    if (propertyIds.length === 0) { setNotifications([]); return; }
    Promise.all(propertyIds.map(id => fetchNotifications(id, 10)))
      .then(lists => setNotifications(lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30)))
      .catch(err => console.warn('Failed to load portfolio notifications:', err));

    const unsubscribes = propertyIds.map(id =>
      subscribeToNotifications(id, (row) => setNotifications(prev => [row, ...prev].slice(0, 30)))
    );
    return () => unsubscribes.forEach(fn => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    markNotificationRead(id).catch(err => console.warn('Failed to mark notification read:', err));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, markRead };
}
