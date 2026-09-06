import React, { useState, useEffect } from 'react';
import { KdsOrder, AppView } from '../types';
import { 
  Play, 
  Check, 
  CheckCheck, 
  Clock, 
  AlertTriangle, 
  ChefHat, 
  Timer, 
  Truck, 
  Flame,
  CheckCircle2
} from 'lucide-react';

interface KitchenKDSProps {
  orders: KdsOrder[];
  onUpdateOrder: (order: KdsOrder) => void;
  onNavigate: (view: AppView) => void;
}

export const KitchenKDS: React.FC<KitchenKDSProps> = ({
  orders,
  onUpdateOrder,
  onNavigate,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');

  // Live ticking clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const newOrders = orders.filter(o => o.status === 'new');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const readyOrders = orders.filter(o => o.status === 'ready');

  const handleStartPreparing = (order: KdsOrder) => {
    onUpdateOrder({
      ...order,
      status: 'preparing',
    });
  };

  const handleToggleItemComplete = (order: KdsOrder, itemIndex: number) => {
    const updatedItems = [...order.items];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      completed: !updatedItems[itemIndex].completed,
    };
    onUpdateOrder({
      ...order,
      items: updatedItems,
    });
  };

  const handleMarkReady = (order: KdsOrder) => {
    onUpdateOrder({
      ...order,
      status: 'ready',
    });
  };

  // Doesn't mark the order delivered — "ready" already means ready for
  // pickup/dispatch. Active Deliveries is where a runner actually confirms
  // hand-off, so the status only moves to 'delivered' there.
  const handleDispatchRunner = (order: KdsOrder) => {
    onNavigate('active_deliveries');
  };

  return (
    <div id="kitchen-kds-canvas" className="flex-1 flex flex-col h-full bg-[#f6faff] overflow-hidden">
      {/* Top KDS Header */}
      <header className="bg-white shadow-2xs w-full h-16 flex justify-between items-center px-4 md:px-8 shrink-0 border-b border-[#E9ECEF] z-20">
        <div className="flex items-center gap-3 md:gap-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#765a25] text-white rounded-lg">
              <ChefHat className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-[#765a25]">Kitchen KDS</span>
          </div>

          <span className="hidden sm:flex items-center gap-2 text-xs font-semibold text-[#4e463a] bg-[#ecf5fe] px-3 py-1 rounded-full border border-[#E9ECEF]">
            <span className="w-2 h-2 rounded-full bg-[#2D6A4F] animate-pulse"></span>
            <span>Room Dining • Online</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-mono text-xl md:text-2xl font-bold text-[#141d23] bg-[#ecf5fe] px-3 py-1 rounded-lg border border-[#E9ECEF]">
            <Clock className="w-4 h-4 text-[#765a25]" />
            <span>{currentTime || '17:59:00'}</span>
          </div>
        </div>
      </header>

      {/* Main KDS Columns Container */}
      <main className="flex-1 overflow-x-auto p-4 md:p-6 flex gap-6">
        {/* COLUMN 1: NEW ORDERS */}
        <section className="flex-none w-[85vw] sm:w-[360px] md:w-[380px] lg:w-[400px] flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#E9ECEF]">
            <h2 className="text-lg font-bold text-[#141d23] flex items-center gap-2">
              <span>New</span>
            </h2>
            <span className="bg-[#bd9b60] text-white px-2.5 py-0.5 rounded-full text-xs font-bold shadow-xs">
              {newOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {newOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#7f7668] border-2 border-dashed border-[#E9ECEF] rounded-xl">
                No new incoming tickets
              </div>
            ) : (
              newOrders.map((order) => (
                <article
                  key={order.id}
                  id={`kds-card-${order.id}`}
                  className="bg-white border-2 border-[#D4A373] rounded-xl p-4 flex flex-col shadow-sm relative overflow-hidden"
                >
                  {/* Timer Header Badge */}
                  <div className="absolute top-0 right-0 bg-[#D4A373] text-white px-3 py-1 rounded-bl-lg text-xs font-bold flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5" />
                    <span>{order.timeElapsed}</span>
                  </div>

                  <div className="flex justify-between items-start mb-3 pr-20">
                    <div>
                      <h3 className="text-2xl font-bold text-[#141d23]">{order.roomNumber}</h3>
                      <p className="text-xs text-[#7f7668]">
                        Order {order.orderNumber} {order.isVip ? '• VIP Guest' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="space-y-2 mb-4">
                    {order.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-start py-1.5 border-b border-[#E9ECEF] border-dashed"
                      >
                        <span className="font-semibold text-sm text-[#141d23]">
                          {item.quantity}x {item.name}
                        </span>
                        {item.modifier && (
                          <span className="text-xs text-[#7f7668]">{item.modifier}</span>
                        )}
                      </div>
                    ))}

                    {order.notes && (
                      <div className="bg-[#ffdad6]/30 text-[#93000a] p-2.5 rounded-lg text-xs border border-[#ffdad6] mt-2">
                        <span className="font-bold">Note: </span>
                        {order.notes}
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <button
                    id={`btn-start-prep-${order.id}`}
                    onClick={() => handleStartPreparing(order)}
                    className="w-full h-11 bg-[#765a25] text-white rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-[#5c4210] active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Start Preparing</span>
                  </button>
                </article>
              ))
            )}
          </div>
        </section>

        {/* COLUMN 2: PREPARING */}
        <section className="flex-none w-[85vw] sm:w-[360px] md:w-[380px] lg:w-[400px] flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#E9ECEF]">
            <h2 className="text-lg font-bold text-[#141d23] flex items-center gap-2">
              <span>Preparing</span>
            </h2>
            <span className="bg-[#e2e2e5] text-[#636467] px-2.5 py-0.5 rounded-full text-xs font-bold">
              {preparingOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {preparingOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#7f7668] border-2 border-dashed border-[#E9ECEF] rounded-xl">
                No orders currently in preparation
              </div>
            ) : (
              preparingOrders.map((order) => {
                const isOverdue = order.isOverdue || order.timerSeconds > 900;
                return (
                  <article
                    key={order.id}
                    id={`kds-card-${order.id}`}
                    className={`bg-white border-2 ${
                      isOverdue ? 'border-[#BC4749]' : 'border-[#bd9b60]'
                    } rounded-xl p-4 flex flex-col shadow-sm relative overflow-hidden`}
                  >
                    {/* Timer Tag */}
                    <div
                      className={`absolute top-0 right-0 ${
                        isOverdue ? 'bg-[#BC4749] text-white animate-pulse' : 'bg-[#bd9b60] text-white'
                      } px-3 py-1 rounded-bl-lg text-xs font-bold flex items-center gap-1`}
                    >
                      <Timer className="w-3.5 h-3.5" />
                      <span>{order.timeElapsed}</span>
                    </div>

                    <div className="flex justify-between items-start mb-3 pr-28">
                      <div>
                        <h3 className="text-2xl font-bold text-[#141d23]">{order.roomNumber}</h3>
                        <p className="text-xs text-[#7f7668]">
                          Order {order.orderNumber} {order.isRush ? '• Rush' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Interactive item checklist */}
                    <div className="space-y-2 mb-4">
                      {order.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2.5 py-1.5 border-b border-[#E9ECEF] border-dashed"
                        >
                          <button
                            onClick={() => handleToggleItemComplete(order, idx)}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${
                              item.completed
                                ? 'bg-[#2D6A4F] border-[#2D6A4F] text-white'
                                : 'border-[#E9ECEF] hover:border-[#2D6A4F] text-transparent'
                            }`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <span
                            className={`text-sm font-semibold flex-1 ${
                              item.completed ? 'line-through text-[#7f7668]' : 'text-[#141d23]'
                            }`}
                          >
                            {item.quantity}x {item.name}
                          </span>
                        </div>
                      ))}

                      {order.notes && (
                        <div className="bg-[#ecf5fe] text-[#4e463a] p-2.5 rounded-lg text-xs border border-[#E9ECEF]">
                          {order.notes}
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <button
                      id={`btn-mark-ready-${order.id}`}
                      onClick={() => handleMarkReady(order)}
                      className="w-full h-11 bg-[#2D6A4F] text-white rounded-lg text-sm font-bold uppercase tracking-wider hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[#2D6A4F]/20"
                    >
                      <CheckCheck className="w-4 h-4" />
                      <span>Mark Ready</span>
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* COLUMN 3: READY FOR PICKUP */}
        <section className="flex-none w-[85vw] sm:w-[360px] md:w-[380px] lg:w-[400px] flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#E9ECEF]">
            <h2 className="text-lg font-bold text-[#141d23] flex items-center gap-2">
              <span>Ready for Pickup</span>
            </h2>
            <span className="bg-[#2D6A4F]/20 text-[#2D6A4F] px-2.5 py-0.5 rounded-full text-xs font-bold">
              {readyOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {readyOrders.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-[#E9ECEF] rounded-xl p-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-[#9ea0a1] mb-2" />
                <p className="text-sm font-semibold text-[#4e463a]">No items waiting for pickup</p>
                <p className="text-xs text-[#7f7668] mt-1">Orders marked ready will appear here for staff delivery dispatch</p>
              </div>
            ) : (
              readyOrders.map((order) => (
                <article
                  key={order.id}
                  id={`kds-ready-card-${order.id}`}
                  className="bg-white border-2 border-[#2D6A4F] rounded-xl p-4 flex flex-col shadow-sm relative overflow-hidden"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-2xl font-bold text-[#141d23]">{order.roomNumber}</h3>
                      <p className="text-xs text-[#2D6A4F] font-bold">Ready on Expediter Station</p>
                    </div>
                    <span className="bg-[#2D6A4F] text-white text-xs px-2 py-1 rounded-md font-bold">
                      Order {order.orderNumber}
                    </span>
                  </div>

                  <div className="space-y-1 mb-4 text-xs text-[#4e463a]">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{it.quantity}x {it.name}</span>
                        <span className="text-[#2D6A4F] font-bold">✓ Plated</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => handleDispatchRunner(order)}
                    className="w-full h-11 bg-[#765a25] text-white rounded-lg text-sm font-bold hover:bg-[#5c4210] flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Dispatch to Runner &rarr;</span>
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
