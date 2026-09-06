import React, { useEffect, useState } from 'react';
import { AppView } from '../types';
import { fetchOrdersForProperty, updateOrderStatus, StaffOrder } from '../lib/staffApi';
import {
  ArrowLeft,
  MapPin,
  Clock,
  Info,
  CheckCircle2,
  CheckCheck,
  RefreshCw,
  PackageCheck,
} from 'lucide-react';

interface ActiveDeliveriesProps {
  propertyId: string;
  onNavigate: (view: AppView) => void;
}

function elapsedLabel(createdAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  return minutes === 0 ? 'Just now' : `${minutes}m ago`;
}

/**
 * Real orders sitting at status 'ready' — the kitchen has plated them and
 * Kitchen KDS's "Dispatch to Runner" has pointed a staff member here. This
 * is the one place that actually flips an order to 'delivered'.
 */
export const ActiveDeliveries: React.FC<ActiveDeliveriesProps> = ({ propertyId, onNavigate }) => {
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [justDelivered, setJustDelivered] = useState<string | null>(null);

  const load = async () => {
    try {
      const all = await fetchOrdersForProperty(propertyId);
      setOrders(all.filter(o => o.status === 'ready'));
    } catch (err) {
      console.warn('Failed to load active deliveries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const handleMarkDelivered = async (order: StaffOrder) => {
    try {
      await updateOrderStatus(order.id, 'delivered');
      setOrders(prev => prev.filter(o => o.id !== order.id));
      setJustDelivered(order.roomId.split('-').pop() ?? order.roomId);
      setTimeout(() => setJustDelivered(null), 3000);
    } catch (err) {
      console.warn(`Failed to mark order ${order.id} delivered:`, err);
    }
  };

  return (
    <div id="active-deliveries-canvas" className="w-full min-h-screen flex flex-col bg-[#f6faff] p-4 sm:p-6 lg:p-8">
      <div className="max-w-xl mx-auto w-full flex-grow flex flex-col space-y-6">
        {/* Top Header */}
        <header className="flex justify-between items-center pb-4 border-b border-[#E9ECEF]">
          <div className="flex items-center gap-2">
            <button
              id="btn-back-from-delivery"
              onClick={() => onNavigate('reception')}
              className="p-2 rounded-full hover:bg-[#ecf5fe] text-[#765a25] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl md:text-2xl font-bold text-[#765a25]">Active Deliveries</h1>
          </div>

          <button
            onClick={load}
            className="h-9 px-3 rounded-lg bg-white border border-[#E9ECEF] text-[#4e463a] text-xs font-semibold hover:bg-[#ecf5fe] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </header>

        {/* Success Confirmation Toast */}
        {justDelivered && (
          <div className="bg-[#2D6A4F] text-white p-4 rounded-xl shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <CheckCheck className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold text-sm">Delivery Completed!</p>
              <p className="text-xs text-white/90">Room {justDelivered}'s order marked delivered and billed to their folio.</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-sm text-[#4e463a]">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center bg-white rounded-2xl border border-[#E9ECEF] flex flex-col items-center gap-2">
            <PackageCheck className="w-10 h-10 text-[#9ea0a1]" />
            <p className="text-sm font-semibold text-[#4e463a]">No deliveries waiting</p>
            <p className="text-xs text-[#7f7668]">Orders marked "Ready" on the Kitchen KDS board show up here.</p>
          </div>
        ) : (
          orders.map(order => {
            const roomNumber = order.roomId.split('-').pop() ?? order.roomId;
            return (
              <div
                key={order.id}
                id={`delivery-job-card-${order.id}`}
                className="bg-white rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-[#E9ECEF] overflow-hidden flex flex-col"
              >
                <div className="bg-[#ecf5fe] p-5 border-b border-[#E9ECEF] flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold text-[#141d23] mb-0.5 flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-[#765a25] fill-[#765a25]" />
                      <span>Room {roomNumber}</span>
                    </h2>
                    <p className="text-xs text-[#4e463a]">Order #{order.id.slice(0, 4)}</p>
                  </div>
                  <div className="bg-[#D4A373]/20 text-[#765a25] px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{elapsedLabel(order.createdAt)}</span>
                  </div>
                </div>

                <div className="p-5 flex flex-col gap-4">
                  <div className="border border-[#E9ECEF] rounded-xl p-4 bg-[#f6faff]">
                    <h3 className="text-[11px] font-bold text-[#4e463a] uppercase tracking-wider mb-2.5">
                      Items ({order.items.length})
                    </h3>
                    <ul className="space-y-2 text-sm text-[#141d23]">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="flex justify-between items-center font-medium">
                          <span>{item.name}</span>
                          <span className="font-bold text-[#765a25]">x{item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {order.items.some(i => i.fromRecommendation) && (
                    <div className="bg-[#4A6274]/10 rounded-xl p-4 flex gap-3 items-start border border-[#4A6274]/20">
                      <Info className="w-5 h-5 text-[#4A6274] shrink-0 mt-0.5" />
                      <p className="text-xs font-medium text-[#141d23]">
                        Includes an item the guest added from a recommendation.
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-5 pt-0">
                  <button
                    onClick={() => handleMarkDelivered(order)}
                    className="h-14 w-full bg-[#765a25] text-white hover:bg-[#5c4210] font-bold text-base rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-6 h-6" />
                    <span>Mark Delivered</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
