import React, { useEffect, useState } from 'react';
import { fetchActiveOrder, ActiveOrder } from '../lib/guestApi';
import { computeOrderEta } from '../lib/eta';
import { ChefHat, Check, X } from 'lucide-react';

interface OrderStatusBarProps {
  token: string;
}

const STATUS_STEPS: ActiveOrder['status'][] = ['new', 'preparing', 'ready'];

/**
 * Floats at the top of every guest screen (mounted once in GuestApp, above
 * whichever sub-view is active) so a guest can be anywhere in the app and
 * still see their order's status — not just on the page they placed it
 * from. Polls every 8s; disappears once the order hits 'delivered' (which
 * fetchActiveOrder never returns in the first place).
 */
export function OrderStatusBar({ token }: OrderStatusBarProps) {
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null); // order id the guest closed manually

  useEffect(() => {
    let cancelled = false;
    const poll = () => fetchActiveOrder(token).then(o => { if (!cancelled) setOrder(o); }).catch(() => {});
    poll();
    const interval = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  if (!order || order.id === dismissed) return null;

  const eta = computeOrderEta(order.items, order.createdAt, order.status);
  const stepIndex = STATUS_STEPS.indexOf(order.status);

  return (
    <div className="fixed top-0 inset-x-0 z-40 flex justify-center px-3 pt-3 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md bg-white rounded-2xl shadow-lg border border-[#E9ECEF] p-4 animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#765a25] text-white flex items-center justify-center shrink-0">
              <ChefHat className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#141d23] truncate">{eta.statusLabel}</p>
              <p className="text-[11px] text-[#7f7668]">Order #{order.id.slice(0, 4)} · Est. {eta.etaLabel}</p>
            </div>
          </div>
          <button onClick={() => setDismissed(order.id)} className="p-1 text-gray-400 hover:text-gray-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step progress: Received -> Preparing -> Ready */}
        <div className="flex items-center gap-1.5 mt-3">
          {STATUS_STEPS.map((step, i) => (
            <React.Fragment key={step}>
              <div className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? 'bg-[#765a25]' : 'bg-[#E9ECEF]'}`} />
            </React.Fragment>
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#7f7668]">
          <span className={stepIndex >= 0 ? 'text-[#765a25]' : ''}>Received</span>
          <span className={stepIndex >= 1 ? 'text-[#765a25]' : ''}>Preparing</span>
          <span className={stepIndex >= 2 ? 'text-[#2D6A4F] flex items-center gap-0.5' : ''}>
            {stepIndex >= 2 && <Check className="w-2.5 h-2.5" />} Ready
          </span>
        </div>
      </div>
    </div>
  );
}
