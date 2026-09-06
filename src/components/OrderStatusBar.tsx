import React, { useEffect, useState } from 'react';
import { fetchActiveOrder, ActiveOrder } from '../lib/guestApi';
import { computeOrderEta } from '../lib/eta';
import { formatCurrency } from '../lib/currency';
import { ChefHat, Check, X, ChevronDown } from 'lucide-react';

interface OrderStatusBarProps {
  token: string;
  currency: string;
}

const STATUS_STEPS: ActiveOrder['status'][] = ['new', 'preparing', 'ready'];

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Floats at the top of every guest screen (mounted once in GuestApp, above
 * whichever sub-view is active) so a guest can be anywhere in the app and
 * still see their order — the actual "track my order" cart, not just a
 * static status pill. Tap it to expand the line items. Polls the order
 * itself every 8s (a room-service update doesn't need sub-second
 * freshness), but the countdown ticks every second client-side, same feel
 * as tableorder's kitchen timer, so it reads as live even between polls.
 * Disappears once the order hits 'delivered' (fetchActiveOrder never
 * returns one in the first place).
 */
export function OrderStatusBar({ token, currency }: OrderStatusBarProps) {
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null); // order id the guest closed manually
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const poll = () => fetchActiveOrder(token).then(o => { if (!cancelled) setOrder(o); }).catch(() => {});
    poll();
    const interval = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  // The live-ticking part — separate from the data poll above so the
  // countdown doesn't visibly jump/stutter between 8s server refreshes.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  if (!order || order.id === dismissed) return null;

  const eta = computeOrderEta(order.items, order.createdAt, order.status);
  const stepIndex = STATUS_STEPS.indexOf(order.status);
  const etaTimestamp = new Date(order.createdAt).getTime() + eta.minutes * 60_000;
  const remainingMs = etaTimestamp - now;
  const isOverdue = remainingMs <= 0 && order.status !== 'ready';

  return (
    <div className="fixed top-0 inset-x-0 z-40 flex justify-center px-3 pt-3 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md bg-white rounded-2xl shadow-lg border border-[#E9ECEF] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
        <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#765a25] text-white flex items-center justify-center shrink-0">
                <ChefHat className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#141d23] truncate">{eta.statusLabel}</p>
                <p className="text-[11px] text-[#7f7668]">
                  Order #{order.id.slice(0, 4)} ·{' '}
                  {order.status === 'ready' ? (
                    <span className="text-[#2D6A4F] font-semibold">Ready now</span>
                  ) : isOverdue ? (
                    <span className="text-[#BC4749] font-semibold">Running a little late</span>
                  ) : (
                    <span className="font-mono font-semibold text-[#765a25]">{formatCountdown(remainingMs)}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); setDismissed(order.id); }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </span>
            </div>
          </div>

          {/* Step progress: Received -> Preparing -> Ready */}
          <div className="flex items-center gap-1.5 mt-3">
            {STATUS_STEPS.map((step) => (
              <div key={step} className={`h-1.5 flex-1 rounded-full ${STATUS_STEPS.indexOf(step) <= stepIndex ? 'bg-[#765a25]' : 'bg-[#E9ECEF]'}`} />
            ))}
          </div>
          <div className="flex justify-between mt-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#7f7668]">
            <span className={stepIndex >= 0 ? 'text-[#765a25]' : ''}>Received</span>
            <span className={stepIndex >= 1 ? 'text-[#765a25]' : ''}>Preparing</span>
            <span className={stepIndex >= 2 ? 'text-[#2D6A4F] flex items-center gap-0.5' : ''}>
              {stepIndex >= 2 && <Check className="w-2.5 h-2.5" />} Ready
            </span>
          </div>
        </button>

        {expanded && (
          <div className="border-t border-[#E9ECEF] px-4 py-3 space-y-1.5 bg-[#f6faff]">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-[#4e463a]">{item.quantity}&times; {item.name}</span>
                <span className="text-[#141d23] font-semibold">{formatCurrency(item.price * item.quantity, currency)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs pt-1.5 mt-1.5 border-t border-[#E9ECEF] font-bold">
              <span className="text-[#141d23]">Total</span>
              <span className="text-[#765a25]">{formatCurrency(order.totalAmount, currency)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
