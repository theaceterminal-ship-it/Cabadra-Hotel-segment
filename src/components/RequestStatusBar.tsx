import React, { useEffect, useState } from 'react';
import { fetchActiveGuestRequests, ActiveGuestRequest } from '../lib/guestApi';
import { Bell, ChevronDown, Clock, Play, AlertTriangle } from 'lucide-react';

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
 * The request-side counterpart to OrderStatusBar — same "something's in
 * flight" bar, for guest_requests (housekeeping, concierge, amenities...)
 * instead of F&B orders. Found missing live-testing: a submitted request
 * genuinely reaches guest_requests (confirmed on the Reception board), but
 * nothing on the guest's own screen ever said so, unlike food's "Order
 * received" bar. Polls every 8s, same cadence as orders; a request drops
 * off this list the moment guest_requests.status leaves 'open'
 * (guest_get_active_requests, 0051), so there's nothing to dismiss once
 * staff resolves it — the list just gets shorter.
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

  if (requests.length === 0) return null;

  const anyRejected = requests.some(r => r.taskStatus === 'rejected');

  return (
    <div className={`pointer-events-auto w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-lg border overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 ${anyRejected ? 'border-error-container' : 'border-outline-variant'}`}>
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${anyRejected ? 'bg-error text-on-error' : 'bg-primary text-on-primary'}`}>
            <Bell className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-on-surface truncate">
              {requests.length === 1 ? requests[0].title : `${requests.length} requests in progress`}
            </p>
            {requests.length === 1 && (
              <p className="text-[11px] text-on-surface-variant">{STATUS_LABEL[requests[0].taskStatus ?? 'received']}</p>
            )}
          </div>
        </div>
        {requests.length > 1 && <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />}
      </button>

      {expanded && requests.length > 1 && (
        <div className="border-t border-outline-variant px-4 py-1 divide-y divide-outline-variant bg-surface-container-low">
          {requests.map(r => <RequestRow key={r.id} request={r} />)}
        </div>
      )}
    </div>
  );
}
