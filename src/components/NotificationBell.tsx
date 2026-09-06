import React, { useEffect, useRef, useState } from 'react';
import { Bell, UtensilsCrossed, Megaphone, ClipboardList, AlertTriangle } from 'lucide-react';
import { AppNotification } from '../types';

const ICONS: Record<AppNotification['type'], typeof Bell> = {
  new_order: UtensilsCrossed,
  guest_request: Megaphone,
  high_priority_request: AlertTriangle,
  task_created: ClipboardList,
  new_arrival: Bell,
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

interface NotificationBellProps {
  notifications: AppNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead?: () => void;
}

/** A header bell + dropdown, fed by useNotifications/usePortfolioNotifications. Realtime-driven — no polling here, the hook's Supabase subscription pushes new rows in. */
export const NotificationBell: React.FC<NotificationBellProps> = ({ notifications, unreadCount, onMarkRead, onMarkAllRead }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        id="btn-notification-bell"
        onClick={() => setOpen(o => !o)}
        className="relative h-9 w-9 flex items-center justify-center rounded-lg text-[#4e463a] hover:bg-[#ecf5fe] transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#BC4749] text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl border border-[#E9ECEF] shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#E9ECEF] bg-[#f6faff] flex items-center justify-between">
            <span className="text-xs font-bold text-[#141d23]">Notifications</span>
            {onMarkAllRead && unreadCount > 0 && (
              <button onClick={onMarkAllRead} className="text-[11px] font-semibold text-[#765a25] hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-[#E9ECEF]">
            {notifications.length === 0 ? (
              <p className="text-xs text-[#7f7668] text-center py-8">Nothing yet.</p>
            ) : (
              notifications.map(n => {
                const Icon = ICONS[n.type] ?? Bell;
                return (
                  <button
                    key={n.id}
                    onClick={() => onMarkRead(n.id)}
                    className={`w-full text-left px-4 py-3 flex gap-2.5 hover:bg-[#ecf5fe] transition-colors ${n.read ? 'opacity-60' : ''}`}
                  >
                    <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${n.type === 'high_priority_request' ? 'text-[#BC4749]' : 'text-[#765a25]'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-[#141d23] truncate">{n.title}</p>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#765a25] shrink-0 mt-1" />}
                      </div>
                      {n.body && <p className="text-[11px] text-[#4e463a] mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-[#7f7668] mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
