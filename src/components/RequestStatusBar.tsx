import React, { useEffect, useState } from 'react';
import { fetchActiveGuestRequests, ActiveGuestRequest } from '../lib/guestApi';
import { Bell, Clock, Play, AlertTriangle } from 'lucide-react';

interface RequestStatusBarProps {
  token: string;
}

const STATUS_LABEL: Record<NonNullable<ActiveGuestRequest['taskStatus']> | 'received', string> = {
  received: 'Request received',
  pending: 'Request received',
  in_progress: 'On the way',
  completed: 'Done',
  rejected: "Couldn't be done",
};

const RequestRow: React.FC<{ request: ActiveGuestRequest }> = ({ request }) => {
  const status = request.taskStatus ?? 'received';
  if (status === 'rejected') {
    return (
      <div className="flex items-start gap-2 py-2">
        <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-on-surface truncate">{request.title}</p>
          <p className="text-[11px] text-error">{request.rejectionNote || "Couldn't be done"}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-2">
      {status === 'in_progress' ? (
        <Play className="w-3.5 h-3.5 text-primary shrink-0 fill-current" />
      ) : (
        <Clock className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-on-surface truncate">{request.title}</p>
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-wide shrink-0 ${status === 'in_progress' ? 'text-primary' : 'text-on-surface-variant'}`}>
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
};

/**
 * The request-side counterpart to OrderStatusBar, but a small floating
 * button + dropdown (top-right) instead of a wide banner — a full-width
 * bar competing with OrderStatusBar for the same top-center space was more
 * than this needed. Polls every 8s, same cadence as orders; a request
 * drops off the moment guest_requests.status leaves 'open'
 * (guest_get_active_requests, 0051). Always rendered, even with nothing
 * active, so "did my request go through" always has somewhere to check.
 */
export function RequestStatusBar({ token }: RequestStatusBarProps) {
  const [requests, setRequests] = useState<ActiveGuestRequest[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = () => fetchActiveGuestRequests(token).then(r => { if (!cancelled) setRequests(r); }).catch(() => {});
    poll();
    const interval = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  const anyRejected = requests.some(r => r.taskStatus === 'rejected');
  const isEmpty = requests.length === 0;

  return (
    <div className="fixed top-3 right-3 z-40 pointer-events-auto">
      <button
        onClick={() => setExpanded(e => !e)}
        title="My Requests"
        className={`relative h-10 px-3 rounded-full shadow-lg flex items-center gap-1.5 transition-colors ${
          anyRejected ? 'bg-error text-on-error' : isEmpty ? 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant' : 'bg-primary text-on-primary'
        }`}
      >
        <Bell className="w-4 h-4" />
        {!isEmpty && (
          <span className="text-xs font-bold">{requests.length}</span>
        )}
      </button>

      {expanded && (
        <div className="absolute top-full right-0 mt-2 w-72 max-w-[85vw] bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-4 py-2.5 border-b border-outline-variant bg-surface-container-low">
            <span className="text-xs font-bold text-on-surface">My Requests</span>
          </div>
          <div className="px-4 py-1 divide-y divide-outline-variant max-h-72 overflow-y-auto">
            {isEmpty ? (
              <p className="text-xs text-on-surface-variant text-center py-4">Nothing pending right now — you're all caught up.</p>
            ) : (
              requests.map(r => <RequestRow key={r.id} request={r} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
