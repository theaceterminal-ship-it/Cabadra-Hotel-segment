import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  fetchActiveOrder, fetchActiveGuestRequests, dismissGuestRequest, fetchGuestExperienceBookings,
  ActiveOrder, ActiveGuestRequest,
} from '../lib/guestApi';
import type { GuestExperienceBooking } from '../types';
import { computeOrderEta } from '../lib/eta';
import { formatCurrency } from '../lib/currency';
import { ChefHat, Check, X, AlertTriangle, Clock, Play, BellOff, ChevronRight, Calendar } from 'lucide-react';

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

/** A rejected order the guest has cleared stays cleared across reloads (the server keeps returning the last rejected order). */
const CLEARED_ORDER_KEY = 'cabadra_cleared_order';

function readClearedOrder(): string | null {
  try { return localStorage.getItem(CLEARED_ORDER_KEY); } catch { return null; }
}

/** Minutes left, rounded up: what the pill shows, so it changes once a minute rather than every second. */
function minutesLeft(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000));
}

/**
 * The guest's live status: one pill in the top bar that says the single
 * most useful thing right now (the food, or how a request is going), and a
 * sheet with the whole picture when tapped: the order, every request and
 * the guest's bookings. Polls every 8 seconds.
 *
 * Nothing still in progress can be cleared from here. A request can only be
 * cleared once its task is done or declined (guest_dismiss_request, 0077),
 * and the food order only when the kitchen declined it: anything else stays
 * tracked until it's finished.
 */
export function DynamicIslandStatusBar({ token, currency, className }: DynamicIslandStatusBarProps) {
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [requests, setRequests] = useState<ActiveGuestRequest[]>([]);
  const [bookings, setBookings] = useState<GuestExperienceBooking[]>([]);
  const [clearedOrder, setClearedOrder] = useState<string | null>(readClearedOrder);
  const [clearedRequests, setClearedRequests] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetchActiveOrder(token).then(o => { if (!cancelled) setOrder(o); }).catch(() => {});
      fetchActiveGuestRequests(token).then(r => { if (!cancelled) setRequests(r); }).catch(() => {});
      fetchGuestExperienceBookings(token).then(b => { if (!cancelled) setBookings(b); }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  // The pill and the sheet both show whole minutes, so a coarse tick is enough.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, []);

  const clearRequest = async (requestId: string) => {
    setClearedRequests(prev => [...prev, requestId]);
    await dismissGuestRequest(token, requestId);
  };

  const clearOrder = (orderId: string) => {
    setClearedOrder(orderId);
    try { localStorage.setItem(CLEARED_ORDER_KEY, orderId); } catch { /* private mode: cleared for this visit only */ }
  };

  const activeOrder = order && !(order.status === 'rejected' && order.id === clearedOrder) ? order : null;
  const visibleRequests = requests.filter(r => !clearedRequests.includes(r.id));
  const inProgress = visibleRequests.filter(r => r.taskStatus !== 'completed' && r.taskStatus !== 'rejected');
  const upcomingBookings = bookings.filter(b => b.status === 'pending' || b.status === 'requested' || b.status === 'confirmed');

  let remainingMs = 0;
  let overdue = false;
  if (activeOrder && activeOrder.status !== 'rejected') {
    const eta = computeOrderEta(activeOrder.items, activeOrder.createdAt, activeOrder.status);
    remainingMs = new Date(activeOrder.createdAt).getTime() + eta.minutes * 60_000 - now;
    overdue = remainingMs <= 0 && activeOrder.status !== 'ready';
  }
  const orderLine = !activeOrder ? ''
    : activeOrder.status === 'rejected' ? 'Order not placed'
    : activeOrder.status === 'ready' ? 'Food · on its way'
    : overdue ? 'Food · almost there'
    : `Food · ${minutesLeft(remainingMs)} min`;

  // `pillKey` changes only when the situation changes (a new stage, another
  // request), never on a countdown tick, so the label only animates when
  // there's actually news.
  const [label, pillKey] = activeOrder
    ? [orderLine, `order-${activeOrder.id}-${activeOrder.status}-${overdue}`]
    : inProgress.length
      ? [`${inProgress.length > 1 ? `${inProgress.length} requests` : 'Request'} · ${REQUEST_STATUS_LABEL[inProgress[0].taskStatus || 'received']}`, `req-${inProgress.length}-${inProgress[0].taskStatus}`]
      : upcomingBookings.length
        ? [`${upcomingBookings.length > 1 ? `${upcomingBookings.length} bookings` : 'Booking'} · ${upcomingBookings.some(b => b.status === 'confirmed') ? 'confirmed' : 'requested'}`, `book-${upcomingBookings.length}`]
        : ['All quiet', 'quiet'];
  const live = !!activeOrder || inProgress.length > 0;
  const nothingAtAll = !activeOrder && visibleRequests.length === 0 && upcomingBookings.length === 0;

  return (
    <div className={className}>
      <motion.button
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.96 }}
        className="h-10 pl-3.5 pr-3 rounded-full bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-on-surface flex items-center gap-2 max-w-[60vw]"
        aria-label="Live updates"
      >
        <span className="relative flex w-2.5 h-2.5 shrink-0">
          {live && <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />}
          <span className={`relative w-2.5 h-2.5 rounded-full ${activeOrder?.status === 'rejected' ? 'bg-error' : live ? 'bg-success' : upcomingBookings.length ? 'bg-room-ready' : 'bg-outline'}`} />
        </span>
        <span key={pillKey} className="status-pill-in text-[14px] font-medium truncate">
          {label}
        </span>
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
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <div>
                  <h3 className="text-[22px] font-semibold tracking-[-0.03em]">Live updates</h3>
                  <p className="text-xs text-on-surface-variant">{live ? 'Updates every few seconds' : nothingAtAll ? 'Nothing in progress' : 'Nothing on the way right now'}</p>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-surface-container-low flex items-center justify-center text-on-surface-variant">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-4 pb-6 space-y-5 overflow-y-auto" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                {activeOrder && (
                  <div className="rounded-[24px] bg-surface p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="size-11 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0"><ChefHat className="w-5 h-5" /></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold">Your food order</p>
                        <p className="text-xs text-on-surface-variant">
                          {activeOrder.status === 'rejected' ? <span className="text-error font-semibold">The kitchen couldn’t make it</span>
                            : activeOrder.status === 'ready' ? <span className="text-success font-semibold">On its way to your room</span>
                            : overdue ? 'Running a few minutes late'
                            : <>Arriving in about <span className="font-semibold text-on-surface">{minutesLeft(remainingMs)} min</span></>}
                        </p>
                      </div>
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
                          <div className="flex justify-between font-semibold pt-1 text-on-surface">
                            <span>Charged to your room</span>
                            <span>{formatCurrency(activeOrder.totalAmount, currency)}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-error bg-error-container/60 rounded-2xl p-3">
                          {activeOrder.rejectionNote || 'The kitchen was unable to make this order.'} You haven’t been charged.
                        </p>
                        <button onClick={() => clearOrder(activeOrder.id)} className="text-xs font-semibold text-on-surface-variant">Clear</button>
                      </>
                    )}
                  </div>
                )}

                {visibleRequests.length > 0 && (
                  <section>
                    <p className="text-sm font-medium text-on-surface-variant mb-2 px-2">Requests</p>
                    <div className="rounded-[24px] bg-surface divide-y divide-outline-variant">
                      {visibleRequests.map(r => {
                        const status = r.taskStatus ?? 'received';
                        const finished = status === 'completed' || status === 'rejected';
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
                              <p className={`text-xs mt-0.5 ${status === 'rejected' ? 'text-error' : status === 'in_progress' ? 'text-primary font-semibold' : status === 'completed' ? 'text-success font-semibold' : 'text-on-surface-variant'}`}>
                                {status === 'rejected' ? `Couldn’t be done: ${r.rejectionNote || 'staff unavailable'}` : REQUEST_STATUS_LABEL[status]}
                              </p>
                            </div>
                            {finished && (
                              <button onClick={() => clearRequest(r.id)} className="text-xs font-semibold text-on-surface-variant shrink-0 px-2 py-1 rounded-full hover:bg-surface-container">
                                Clear
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {upcomingBookings.length > 0 && (
                  <section>
                    <p className="text-sm font-medium text-on-surface-variant mb-2 px-2">Your bookings</p>
                    <div className="rounded-[24px] bg-surface divide-y divide-outline-variant">
                      {upcomingBookings.map(b => {
                        const confirmed = b.status === 'confirmed';
                        return (
                          <div key={b.id} className="flex items-start gap-3 p-4">
                            <span className="mt-0.5 shrink-0">
                              {confirmed ? <Calendar className="w-4 h-4 text-on-surface" /> : <Clock className="w-4 h-4 text-on-surface-variant" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{b.experienceName}</p>
                              <p className={`text-xs mt-0.5 ${confirmed ? 'text-success font-semibold' : 'text-on-surface-variant'}`}>
                                {b.scheduledTime ? `Confirmed for ${b.scheduledTime}` : confirmed ? 'Confirmed' : `Waiting for the hotel to confirm${b.preferredTime ? ` · you asked for ${b.preferredTime}` : ''}`}
                              </p>
                            </div>
                            <span className="text-xs font-semibold shrink-0">{formatCurrency(b.totalPrice, currency)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {nothingAtAll && (
                  <div className="py-10 text-center text-on-surface-variant">
                    <span className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center mx-auto"><BellOff className="w-5 h-5" /></span>
                    <p className="text-sm font-semibold text-on-surface mt-3">You’re all caught up</p>
                    <p className="text-xs mt-1">Food orders, requests and bookings show up here.</p>
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
