import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, PackageCheck } from 'lucide-react';
import { fetchOrdersForProperty, updateOrderStatus, StaffOrder } from '../lib/staffApi';

const POLL_MS = 8000;
const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

/**
 * Food the kitchen has marked ready, waiting to go up to the room. Whoever
 * takes it taps Delivered, which is what finishes the order (the guest's
 * status then stops saying "on its way"). Shown on the dashboard only while
 * something is waiting; this used to be its own Deliveries page.
 */
export function ReadyToDeliver({ propertyId }: { propertyId: string }) {
  const [orders, setOrders] = useState<StaffOrder[]>([]);

  const load = useCallback(() => {
    fetchOrdersForProperty(propertyId)
      .then(all => setOrders(all.filter(o => o.status === 'ready')))
      .catch(err => console.warn('Failed to load ready orders:', err));
  }, [propertyId]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const deliver = async (order: StaffOrder) => {
    setOrders(prev => prev.filter(o => o.id !== order.id));
    try {
      await updateOrderStatus(order.id, 'delivered');
    } catch (err) {
      console.warn(`Failed to mark order ${order.id} delivered:`, err);
      load();
    }
  };

  if (orders.length === 0) return null;

  return (
    <section className="rounded-[24px] bg-surface-container-lowest border border-outline-variant p-4">
      <h3 className="text-base font-semibold text-on-surface inline-flex items-center gap-2">
        <PackageCheck className="size-4" /> Ready to deliver
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-semibold flex items-center justify-center">{orders.length}</span>
      </h3>
      <ul className="mt-2 divide-y divide-outline-variant">
        <AnimatePresence initial={false}>
          {orders.map(o => (
            <motion.li key={o.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="py-2.5 flex items-center gap-3">
                <span className="size-10 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-semibold shrink-0">{o.roomId.split('-').pop()}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-on-surface truncate">{o.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}</span>
                  <span className="block text-xs text-on-surface-variant">Ready {minutesAgo(o.createdAt) === 0 ? 'just now' : `· ordered ${minutesAgo(o.createdAt)} min ago`}{o.notes ? ` · ${o.notes}` : ''}</span>
                </span>
                <button onClick={() => deliver(o)} className="h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-medium inline-flex items-center gap-1.5 shrink-0">
                  <Check className="size-4" /> Delivered
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
