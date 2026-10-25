import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { fetchActiveOrder, fetchActiveGuestRequests, dismissGuestRequest, ActiveOrder, ActiveGuestRequest } from '../lib/guestApi';
import { computeOrderEta } from '../lib/eta';
import { formatCurrency } from '../lib/currency';
import { ChefHat, Check, X, AlertTriangle, Clock, Play, BellOff, ChevronRight } from 'lucide-react';

interface DynamicIslandStatusBarProps {
  token: string;
  currency: string;
  roomNumber: string;
  className?: string;
}

const STATUS_STEPS: ActiveOrder['status'][] = ['new', 'preparing', 'ready'];
const STEP_LABELS = ['Received', 'Preparing', 'On its way'];

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
 * The guest's live status: one pill in the top bar that says the single
 * most useful thing right now (the food countdown, or how a request is
 * going), and a sheet with the whole picture when tapped. Polls the order
 * and requests every 8 seconds.
 */
export function DynamicIslandStatusBar({ token, currency, className }: DynamicIslandStatusBarProps) {
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [requests, setRequests] = useState<ActiveGuestRequest[]>([]);
  const [dismissedOrder, setDismissedOrder] = useState<string | null>(null);
  const [dismissedRequests, setDismissedRequests] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
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

  const handleDismissRequest = async (requestId: string) => {
    setDismissedRequests(prev => [...prev, requestId]);
    await dismissGuestRequest(token, requestId);
  };

  const activeOrder = order && order.id !== dismissedOrder ? order : null;
  const activeRequests = requests.filter(r => !dismissedRequests.includes(r.id) && r.taskStatus !== 'completed');
  const updates = (activeOrder ? 1 : 0) + activeRequests.length;

  let countdown = '';
  let overdue = false;
  if (activeOrder && activeOrder.status !== 'rejected') {
    const eta = computeOrderEta(activeOrder.items, activeOrder.createdAt, activeOrder.status);
    const remaining = new Date(activeOrder.createdAt).getTime() + eta.minutes * 60_000 - now;
    overdue = remaining <= 0 && activeOrder.status !== 'ready';
    countdown = activeOrder.status === 'ready' ? 'On its way' : overdue ? 'Almost there' : formatCountdown(remaining);
  }

  const label = activeOrder
    ? activeOrder.status === 'rejected' ? 'Order not placed' : `Food · ${countdown}`
    : activeRequests.length
      ? `${activeRequests.length > 1 ? `${activeRequests.length} requests` : 'Request'} · ${REQUEST_STATUS_LABEL[activeRequests[0].taskStatus || 'received']}`
      : 'All quiet';

  return (
    <div className={className}>
      <motion.button
        layout
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.96 }}
        className="h-10 pl-3 pr-2.5 rounded-full bg-surface-container-lowest/90 backdrop-blur-md border border-white/60 shadow-sm text-on-surface flex items-center gap-2 max-w-[60vw]"
        aria-label="Live updates"
      >
        <span className="relative flex w-2.5 h-2.5 shrink-0">
          {updates > 0 && <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />}
          <span className={`relative w-2.5 h-2.5 rounded-full ${updates > 0 ? (activeOrder?.status === 'rejected' ? 'bg-error' : 'bg-success') : 'bg-outline'}`} />
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="text-[13px] font-semibold truncate"
          >
            {label}
          </motion.span>
        </AnimatePresence>
        <ChevronRight className="w-4 h-4 text-on-surface-variant shrink-0" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={e => e.target === e.currentTarget && setOpen(false)}
          >
            <motion.div
              className="w-full sm:max-w-md max-h-[85svh] flex flex-col bg-surface-container-lowest text-on-surface rounded-t-[28px] sm:rounded-[28px] shadow-2xl"
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <h3 className="text-lg font-bold">Live updates</h3>
                  <p className="text-xs text-on-surface-variant">{updates ? `${updates} in progress` : 'Nothing in progress'}</p>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-surface-container-low flex items-center justify-center text-on-surface-variant">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 pb-6 space-y-4 overflow-y-auto" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                {activeOrder && (
                  <div className="rounded-3xl bg-surface-container-low p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0"><ChefHat className="w-5 h-5" /></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold">Your food order</p>
                        <p className="text-xs text-on-surface-variant">
                          {activeOrder.status === 'rejected' ? <span className="text-error font-semibold">The kitchen couldn’t make it</span>
                            : activeOrder.status === 'ready' ? <span className="text-success font-semibold">On its way to your room</span>
                            : overdue ? 'Running a few minutes late'
                            : <>Arriving in about <span className="font-mono font-bold text-on-surface">{countdown}</span></>}
                        </p>
                      </div>
                      <button onClick={() => setDismissedOrder(activeOrder.id)} aria-label="Hide" className="p-1 text-on-surface-variant"><X className="w-4 h-4" /></button>
                    </div>

                    {activeOrder.status !== 'rejected' ? (
                      <>
                        <div className="flex gap-1.5">
                          {STATUS_STEPS.map((step, i) => (
                            <div key={step} className="h-1.5 flex-1 rounded-full bg-outline-variant overflow-hidden">
                              <motion.div
                                className="h-full bg-primary"
                                initial={{ width: 0 }}
                                animate={{ width: i <= STATUS_STEPS.indexOf(activeOrder.status) ? '100%' : '0%' }}
                                transition={{ duration: 0.6, delay: i * 0.15 }}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between text-[10px] font-semibold text-on-surface-variant">
                          {STEP_LABELS.map(l => <span key={l}>{l}</span>)}
                        </div>
                        <div className="pt-2 border-t border-outline-variant space-y-1 text-xs">
                          {activeOrder.items.map((item, i) => (
                            <div key={i} className="flex justify-between gap-2 text-on-surface-variant">
                              <span className="truncate">{item.quantity} × {item.name}</span>
                              <span className="font-semibold text-on-surface shrink-0">{formatCurrency(item.price * item.quantity, currency)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-bold pt-1 text-on-surface">
                            <span>Charged to your room</span>
                            <span>{formatCurrency(activeOrder.totalAmount, currency)}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-error bg-error-container/60 rounded-2xl p-3">
                        {activeOrder.rejectionNote || 'The kitchen was unable to make this order.'} You haven’t been charged.
                      </p>
                    )}
                  </div>
                )}

                {activeRequests.length > 0 && (
                  <div className="rounded-3xl bg-surface-container-low divide-y divide-outline-variant">
                    {activeRequests.map(r => {
                      const status = r.taskStatus ?? 'received';
                      return (
                        <div key={r.id} className="flex items-start gap-3 p-4">
                          <span className="mt-0.5 shrink-0">
                            {status === 'in_progress' ? <Play className="w-4 h-4 text-primary fill-current" />
                              : status === 'rejected' ? <AlertTriangle className="w-4 h-4 text-error" />
                              : status === 'completed' ? <Check className="w-4 h-4 text-success" />
                              : <Clock className="w-4 h-4 text-on-surface-variant" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{r.title}</p>
                            <p className={`text-xs mt-0.5 ${status === 'rejected' ? 'text-error' : status === 'in_progress' ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>
                              {status === 'rejected' ? `Couldn’t be done: ${r.rejectionNote || 'staff unavailable'}` : REQUEST_STATUS_LABEL[status]}
                            </p>
                          </div>
                          <button onClick={() => handleDismissRequest(r.id)} aria-label="Hide" className="p-1 text-on-surface-variant shrink-0"><X className="w-4 h-4" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!activeOrder && activeRequests.length === 0 && (
                  <div className="py-10 text-center text-on-surface-variant">
                    <span className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center mx-auto"><BellOff className="w-5 h-5" /></span>
                    <p className="text-sm font-semibold text-on-surface mt-3">You’re all caught up</p>
                    <p className="text-xs mt-1">Food orders and requests show up here while they’re on the way.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
