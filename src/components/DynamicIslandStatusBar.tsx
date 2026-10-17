import React, { useEffect, useState } from 'react';
import { fetchActiveOrder, fetchActiveGuestRequests, ActiveOrder, ActiveGuestRequest } from '../lib/guestApi';
import { computeOrderEta } from '../lib/eta';
import { formatCurrency } from '../lib/currency';
import { ChefHat, Check, X, AlertTriangle, Sparkles, Clock, Play, ChevronDown, BellOff } from 'lucide-react';

interface DynamicIslandStatusBarProps {
  token: string;
  currency: string;
  roomNumber: string;
}

const STATUS_STEPS: ActiveOrder['status'][] = ['new', 'preparing', 'ready'];

const REQUEST_STATUS_LABEL: Record<NonNullable<ActiveGuestRequest['taskStatus']> | 'received', string> = {
  received: 'Received',
  pending: 'Received',
  in_progress: 'On the way',
  completed: 'Done',
  rejected: "Couldn't be done",
};

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Dynamic Island Status Bar:
 * Merges Room Dining orders and Service Requests into a single, compact,
 * pill-shaped top bar. Replaces the separate floating bell button.
 */
export function DynamicIslandStatusBar({ token, currency, roomNumber }: DynamicIslandStatusBarProps) {
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [requests, setRequests] = useState<ActiveGuestRequest[]>([]);
  const [dismissedOrder, setDismissedOrder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetchActiveOrder(token).then(o => { if (!cancelled) setOrder(o); }).catch(() => {});
      fetchActiveGuestRequests(token).then(r => { if (!cancelled) setRequests(r); }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const activeOrder = order && order.id !== dismissedOrder ? order : null;
  const activeRequests = requests.filter(r => r.taskStatus !== 'completed');
  const hasActiveOrder = Boolean(activeOrder);
  const hasActiveRequests = activeRequests.length > 0;
  const totalUpdatesCount = (hasActiveOrder ? 1 : 0) + activeRequests.length;

  // Compute countdown for active order
  let orderCountdownText = '';
  let isOverdue = false;
  if (activeOrder && activeOrder.status !== 'rejected') {
    const eta = computeOrderEta(activeOrder.items, activeOrder.createdAt, activeOrder.status);
    const etaTimestamp = new Date(activeOrder.createdAt).getTime() + eta.minutes * 60_000;
    const remainingMs = etaTimestamp - now;
    isOverdue = remainingMs <= 0 && activeOrder.status !== 'ready';
    orderCountdownText = activeOrder.status === 'ready' ? 'Ready now!' : isOverdue ? 'Late' : formatCountdown(remainingMs);
  }

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex flex-col items-center max-w-[94vw]">
      {/* Compact Dynamic Island Capsule */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={`group relative h-10 px-4 rounded-full bg-black/90 text-white backdrop-blur-md border border-white/15 shadow-2xl transition-all duration-300 ease-out flex items-center gap-2.5 cursor-pointer hover:bg-black active:scale-95 ${
          expanded ? 'ring-2 ring-white/30' : ''
        }`}
      >
        {/* Status Dot / Icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hasActiveOrder ? (
            <div className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ChefHat className="w-3 h-3" />
            </div>
          ) : hasActiveRequests ? (
            <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-3 h-3" />
            </div>
          ) : (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          )}
        </div>

        {/* Dynamic Label */}
        <div className="text-xs font-medium text-white/90 truncate max-w-[200px] sm:max-w-[280px]">
          {hasActiveOrder && hasActiveRequests ? (
            <span>
              <strong className="text-white font-bold">{totalUpdatesCount} Active Updates</strong> · Dining &amp; Requests
            </span>
          ) : hasActiveOrder && activeOrder ? (
            <span>
              <strong className="text-white font-bold">Dining Order #{activeOrder.id.slice(0, 4)}</strong> ·{' '}
              <span className="text-indigo-300 font-semibold">{orderCountdownText}</span>
            </span>
          ) : hasActiveRequests ? (
            <span>
              <strong className="text-white font-bold">{activeRequests.length} Active Request{activeRequests.length > 1 ? 's' : ''}</strong> · {activeRequests[0].title}
            </span>
          ) : (
            <span className="text-white/80">Room {roomNumber} · All caught up</span>
          )}
        </div>

        {/* Action / Count Pill */}
        <div className="flex items-center gap-1 shrink-0 text-white/60 group-hover:text-white transition-colors">
          {totalUpdatesCount > 0 && (
            <span className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {totalUpdatesCount}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded Status Card */}
      {expanded && (
        <div className="mt-2.5 w-[92vw] max-w-md bg-surface-container-lowest text-on-surface rounded-3xl shadow-2xl border border-outline-variant overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="px-5 py-3 border-b border-outline-variant bg-surface-container-low flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              <h3 className="font-bold text-sm text-on-surface">Stay Live Updates</h3>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="p-1 text-on-surface-variant hover:text-on-surface rounded-full hover:bg-surface-container-high transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Active In-Room Dining Order */}
            {activeOrder && (
              <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                      <ChefHat className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-on-surface">In-Room Dining Order #{activeOrder.id.slice(0, 4)}</p>
                      <p className="text-[11px] text-on-surface-variant">
                        {activeOrder.status === 'ready' ? (
                          <span className="text-success font-semibold">Ready now!</span>
                        ) : activeOrder.status === 'rejected' ? (
                          <span className="text-error font-semibold">Cancelled</span>
                        ) : isOverdue ? (
                          <span className="text-error font-semibold">Running slightly late</span>
                        ) : (
                          <span>ETA: <strong className="text-primary font-mono">{orderCountdownText}</strong></span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setDismissedOrder(activeOrder.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded-lg text-xs"
                    title="Dismiss order banner"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {activeOrder.status !== 'rejected' && (
                  <>
                    {/* Progress Bar */}
                    <div className="flex items-center gap-1.5 pt-1">
                      {STATUS_STEPS.map((step) => {
                        const stepIdx = STATUS_STEPS.indexOf(step);
                        const currentIdx = STATUS_STEPS.indexOf(activeOrder.status);
                        return (
                          <div
                            key={step}
                            className={`h-1.5 flex-1 rounded-full ${stepIdx <= currentIdx ? 'bg-primary' : 'bg-outline-variant'}`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
                      <span>Received</span>
                      <span>Preparing</span>
                      <span>Ready</span>
                    </div>

                    {/* Order Items Summary */}
                    <div className="pt-2 border-t border-outline-variant/60 space-y-1 text-xs">
                      {activeOrder.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-on-surface-variant">
                          <span>{item.quantity}&times; {item.name}</span>
                          <span className="font-semibold text-on-surface">{formatCurrency(item.price * item.quantity, currency)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold pt-1 text-xs text-on-surface">
                        <span>Total</span>
                        <span className="text-primary">{formatCurrency(activeOrder.totalAmount, currency)}</span>
                      </div>
                    </div>
                  </>
                )}

                {activeOrder.status === 'rejected' && (
                  <div className="p-2.5 bg-error/10 border border-error/20 rounded-xl text-xs text-error">
                    <p className="font-bold">Order couldn't be prepared</p>
                    <p className="text-[11px] mt-0.5">{activeOrder.rejectionNote || 'The kitchen was unable to fulfill this order.'}</p>
                    <p className="text-[10px] opacity-80 mt-1">You have not been charged.</p>
                  </div>
                )}
              </div>
            )}

            {/* Active Service Requests */}
            {activeRequests.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-on-surface uppercase tracking-wider">Service Requests</p>
                <div className="divide-y divide-outline-variant border border-outline-variant rounded-2xl bg-surface-container-low overflow-hidden px-3.5">
                  {activeRequests.map(r => {
                    const statusKey = r.taskStatus ?? 'received';
                    const isDone = statusKey === 'completed';
                    const isRejected = statusKey === 'rejected';
                    const isInProgress = statusKey === 'in_progress';

                    return (
                      <div key={r.id} className="py-2.5 flex items-start gap-2.5">
                        <div className="mt-0.5 shrink-0">
                          {isInProgress ? (
                            <Play className="w-4 h-4 text-primary fill-current" />
                          ) : isRejected ? (
                            <AlertTriangle className="w-4 h-4 text-error" />
                          ) : isDone ? (
                            <Check className="w-4 h-4 text-success" />
                          ) : (
                            <Clock className="w-4 h-4 text-on-surface-variant" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-on-surface truncate">{r.title}</p>
                          <p className={`text-[10px] mt-0.5 font-medium ${isRejected ? 'text-error' : isInProgress ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
                            {isRejected ? (r.rejectionNote || "Couldn't be done") : REQUEST_STATUS_LABEL[statusKey]}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty State */}
            {!hasActiveOrder && activeRequests.length === 0 && (
              <div className="py-8 text-center text-on-surface-variant space-y-2">
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center mx-auto text-on-surface-variant">
                  <BellOff className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-on-surface">No active requests or orders</p>
                <p className="text-[11px]">Everything is up to date! Feel free to request amenities or room dining anytime.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
