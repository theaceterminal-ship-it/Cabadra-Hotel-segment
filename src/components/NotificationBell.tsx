import React, { useEffect, useRef, useState } from 'react';
import { Bell, UtensilsCrossed, Megaphone, ClipboardList, AlertTriangle, MessageCircle } from 'lucide-react';
import { AppNotification } from '../types';
import { DatePicker } from './DatePicker';

const ICONS: Record<AppNotification['type'], typeof Bell> = {
  new_order: UtensilsCrossed,
  guest_request: Megaphone,
  high_priority_request: AlertTriangle,
  task_created: ClipboardList,
  new_arrival: Bell,
  folio_chat_message: MessageCircle,
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
  /** Scopes the list to one calendar day — defaults to today in the hook, but a date here lets staff look back instead of being stuck with "all time." */
  date?: string;
  onDateChange?: (date: string) => void;
  /** Opens what a notification is about (e.g. a guest message opens Messages). */
  onOpen?: (n: AppNotification) => void;
}

/** A header bell + dropdown, fed by useNotifications/usePortfolioNotifications. Realtime-driven — no polling here, the hook's Supabase subscription pushes new rows in. */
export const NotificationBell: React.FC<NotificationBellProps> = ({ notifications, unreadCount, onMarkRead, onMarkAllRead, date, onDateChange, onOpen }) => {
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
        className="relative h-9 w-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-error text-on-error text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-surface-container-lowest rounded-xl border border-outline-variant shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-outline-variant bg-surface-container-low flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-on-surface shrink-0">Notifications</span>
            <div className="flex items-center gap-2 shrink-0">
              {onDateChange && (
                <DatePicker
                  value={date ?? ''}
                  onChange={(d) => onDateChange(d)}
                  compact
                  placeholder="Date"
                  className="h-7 px-2 gap-1.5 text-[11px] border border-outline-variant rounded bg-surface-container-lowest focus:border-primary focus:outline-none flex items-center"
                />
              )}
              {onMarkAllRead && unreadCount > 0 && (
                <button onClick={onMarkAllRead} className="text-[11px] font-semibold text-primary hover:underline whitespace-nowrap">
                  Mark all read
                </button>
              )}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-outline-variant">
            {notifications.length === 0 ? (
              <p className="text-xs text-on-surface-variant text-center py-8">Nothing on this date.</p>
            ) : (
              notifications.map(n => {
                const Icon = ICONS[n.type] ?? Bell;
                return (
                  <button
                    key={n.id}
                    onClick={() => { onMarkRead(n.id); if (onOpen) { onOpen(n); setOpen(false); } }}
                    className={`w-full text-left px-4 py-3 flex gap-2.5 hover:bg-surface-container-low transition-colors ${n.read ? 'opacity-60' : ''}`}
                  >
                    <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${n.type === 'high_priority_request' ? 'text-error' : 'text-primary'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-on-surface truncate">{n.title}</p>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" />}
                      </div>
                      {n.body && <p className="text-[11px] text-on-surface-variant mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-on-surface-variant mt-1">{timeAgo(n.createdAt)}</p>
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
